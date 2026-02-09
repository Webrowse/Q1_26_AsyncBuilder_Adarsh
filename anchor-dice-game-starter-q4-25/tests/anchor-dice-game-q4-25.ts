import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AnchorDiceGameQ425 } from "../target/types/anchor_dice_game_q4_25";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Ed25519Program,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { expect } from "chai";

describe("anchor-dice-game-q4-25", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace
    .anchorDiceGameQ425 as Program<AnchorDiceGameQ425>;
  const connection = provider.connection;

  const house = Keypair.generate();
  const player = Keypair.generate();

  let vault: PublicKey;

  // Helper: derive bet PDA from seed
  const getBetPda = (seed: anchor.BN): [PublicKey, number] => {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from("bet"),
        vault.toBuffer(),
        seed.toArrayLike(Buffer, "le", 16),
      ],
      program.programId
    );
  };

  // Helper: serialize bet data to match Bet::to_slice()
  const serializeBet = (betAccount: any): Buffer => {
    return Buffer.concat([
      betAccount.player.toBuffer(),                     // pubkey     32 bytes
      betAccount.seed.toArrayLike(Buffer, "le", 16),    // seed       16 bytes
      betAccount.slot.toArrayLike(Buffer, "le", 8),     // slot       8 bytes
      betAccount.amount.toArrayLike(Buffer, "le", 8),   // amount     8 bytes
      Buffer.from([betAccount.roll, betAccount.bump]),  // roll+bump  2 bytes
    ]);
  };

  before(async () => {
    [vault] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), house.publicKey.toBuffer()],
      program.programId
    );

    // Fund house and player
    const latestBlockhash = await connection.getLatestBlockhash();

    const houseSig = await connection.requestAirdrop(house.publicKey, 100 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction({ signature: houseSig, ...latestBlockhash });

    const playerSig = await connection.requestAirdrop(player.publicKey, 100 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction({ signature: playerSig, ...latestBlockhash });
  });

  // Initialize

  describe("Initialize", () => {
    it("House funds the vault", async () => {
      const amount = new anchor.BN(10 * LAMPORTS_PER_SOL);

      await program.methods
        .initialize(amount)
        .accountsPartial({
          house: house.publicKey,
          vault,
          systemProgram: SystemProgram.programId,
        })
        .signers([house])
        .rpc();

      const vaultBalance = await connection.getBalance(vault);
      expect(vaultBalance).to.equal(10 * LAMPORTS_PER_SOL);
    });
  });

  // Place Bet

  describe("Place Bet", () => {
    it("Player places a valid bet", async () => {
      const seed = new anchor.BN(1);
      const roll = 50;
      const amount = new anchor.BN(0.1 * LAMPORTS_PER_SOL);
      const [betPda] = getBetPda(seed);

      const vaultBefore = await connection.getBalance(vault);

      await program.methods
        .placeBet(seed, roll, amount)
        .accountsPartial({
          player: player.publicKey,
          house: house.publicKey,
          vault,
          bet: betPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([player])
        .rpc();

      // Verify bet account state
      const betAccount = await program.account.bet.fetch(betPda);
      expect(betAccount.player.toBase58()).to.equal(
        player.publicKey.toBase58()
      );
      expect(betAccount.seed.toString()).to.equal(seed.toString());
      expect(betAccount.roll).to.equal(roll);
      expect(betAccount.amount.toString()).to.equal(amount.toString());

      // Verify vault received the deposit
      const vaultAfter = await connection.getBalance(vault);
      expect(vaultAfter - vaultBefore).to.equal(0.1 * LAMPORTS_PER_SOL);
    });

    it("Player places bet with different roll and seed", async () => {
      const seed = new anchor.BN(2);
      const roll = 25;
      const amount = new anchor.BN(0.05 * LAMPORTS_PER_SOL);
      const [betPda] = getBetPda(seed);

      await program.methods
        .placeBet(seed, roll, amount)
        .accountsPartial({
          player: player.publicKey,
          house: house.publicKey,
          vault,
          bet: betPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([player])
        .rpc();

      const betAccount = await program.account.bet.fetch(betPda);
      expect(betAccount.roll).to.equal(25);
      expect(betAccount.amount.toString()).to.equal(amount.toString());
    });
  });

  // ––––––Resolve Bet–––––––––––––––––––––––––––––––––––––––––––––––––

  describe("Resolve Bet", () => {
    it("House resolves bet with valid Ed25519 signature", async () => {
      const seed = new anchor.BN(10);
      const roll = 50;
      const amount = new anchor.BN(0.1 * LAMPORTS_PER_SOL);
      const [betPda] = getBetPda(seed);

      // Place the bet first
      await program.methods
        .placeBet(seed, roll, amount)
        .accountsPartial({
          player: player.publicKey,
          house: house.publicKey,
          vault,
          bet: betPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([player])
        .rpc();

      // Fetch bet account to build the signed message
      const betAccount = await program.account.bet.fetch(betPda);
      const message = serializeBet(betAccount);

      // Create Ed25519 precompile instruction (house signs the bet data)
      const ed25519Ix = Ed25519Program.createInstructionWithPrivateKey({
        privateKey: house.secretKey,
        message,
      });

      // Extract the 64-byte signature from the Ed25519 instruction data
      const ixData = Buffer.from(ed25519Ix.data);
      const sigOffset = ixData.readUInt16LE(2);
      const sig = Buffer.from(ixData.subarray(sigOffset, sigOffset + 64));

      const playerBefore = await connection.getBalance(player.publicKey);
      const vaultBefore = await connection.getBalance(vault);

      // Build resolve_bet instruction
      const resolveBetIx = await program.methods
        .resolveBet(sig)
        .accountsPartial({
          house: house.publicKey,
          player: player.publicKey,
          vault,
          bet: betPda,
          instructionSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      // Transaction: Ed25519 precompile (index 0) + resolve_bet (index 1)
      const tx = new Transaction().add(ed25519Ix).add(resolveBetIx);
      tx.feePayer = house.publicKey;

      await sendAndConfirmTransaction(connection, tx, [house], {
        skipPreflight: true,
        commitment: "confirmed",
      });

      // Bet account should be closed after resolution
      const betAccountInfo = await connection.getAccountInfo(betPda);
      expect(betAccountInfo).to.be.null;

      // Log balance changes to see win/lose outcome
      const playerAfter = await connection.getBalance(player.publicKey);
      const vaultAfter = await connection.getBalance(vault);
      const playerDelta = (playerAfter - playerBefore) / LAMPORTS_PER_SOL;
      const vaultDelta = (vaultAfter - vaultBefore) / LAMPORTS_PER_SOL;

      if (playerDelta > 0) {
        console.log(`    -> Player WON, received ${playerDelta} SOL`);
      } else {
        console.log(`    -> Player LOST, vault kept the bet`);
      }
      console.log(
        `    -> Vault balance change: ${vaultDelta} SOL`
      );
    });

    it("House resolves bet with high roll (96)", async () => {
      const seed = new anchor.BN(11);
      const roll = 96;
      const amount = new anchor.BN(0.05 * LAMPORTS_PER_SOL);
      const [betPda] = getBetPda(seed);

      await program.methods
        .placeBet(seed, roll, amount)
        .accountsPartial({
          player: player.publicKey,
          house: house.publicKey,
          vault,
          bet: betPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([player])
        .rpc();

      const betAccount = await program.account.bet.fetch(betPda);
      const message = serializeBet(betAccount);

      const ed25519Ix = Ed25519Program.createInstructionWithPrivateKey({
        privateKey: house.secretKey,
        message,
      });

      const ixData = Buffer.from(ed25519Ix.data);
      const sigOffset = ixData.readUInt16LE(2);
      const sig = Buffer.from(ixData.subarray(sigOffset, sigOffset + 64));

      const resolveBetIx = await program.methods
        .resolveBet(sig)
        .accountsPartial({
          house: house.publicKey,
          player: player.publicKey,
          vault,
          bet: betPda,
          instructionSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      const tx = new Transaction().add(ed25519Ix).add(resolveBetIx);
      tx.feePayer = house.publicKey;

      await sendAndConfirmTransaction(connection, tx, [house], {
        skipPreflight: true,
        commitment: "confirmed",
      });

      const betAccountInfo = await connection.getAccountInfo(betPda);
      expect(betAccountInfo).to.be.null;
    });

    it("House resolves bet with low roll (2)", async () => {
      const seed = new anchor.BN(12);
      const roll = 2;
      const amount = new anchor.BN(0.01 * LAMPORTS_PER_SOL);
      const [betPda] = getBetPda(seed);

      await program.methods
        .placeBet(seed, roll, amount)
        .accountsPartial({
          player: player.publicKey,
          house: house.publicKey,
          vault,
          bet: betPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([player])
        .rpc();

      const betAccount = await program.account.bet.fetch(betPda);
      const message = serializeBet(betAccount);

      const ed25519Ix = Ed25519Program.createInstructionWithPrivateKey({
        privateKey: house.secretKey,
        message,
      });

      const ixData = Buffer.from(ed25519Ix.data);
      const sigOffset = ixData.readUInt16LE(2);
      const sig = Buffer.from(ixData.subarray(sigOffset, sigOffset + 64));

      const resolveBetIx = await program.methods
        .resolveBet(sig)
        .accountsPartial({
          house: house.publicKey,
          player: player.publicKey,
          vault,
          bet: betPda,
          instructionSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      const tx = new Transaction().add(ed25519Ix).add(resolveBetIx);
      tx.feePayer = house.publicKey;

      await sendAndConfirmTransaction(connection, tx, [house], {
        skipPreflight: true,
        commitment: "confirmed",
      });

      const betAccountInfo = await connection.getAccountInfo(betPda);
      expect(betAccountInfo).to.be.null;
    });
  });

  // –––––Refund Bet––––––––––––––––––––––––––––––––––––––

  describe("Refund Bet", () => {
    it("Fails when timeout has not been reached", async () => {
      const seed = new anchor.BN(20);
      const roll = 50;
      const amount = new anchor.BN(0.1 * LAMPORTS_PER_SOL);
      const [betPda] = getBetPda(seed);

      // Place the bet
      await program.methods
        .placeBet(seed, roll, amount)
        .accountsPartial({
          player: player.publicKey,
          house: house.publicKey,
          vault,
          bet: betPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([player])
        .rpc();

      // Attempt refund immediately - should fail
      try {
        await program.methods
          .refundBet()
          .accountsPartial({
            player: player.publicKey,
            house: house.publicKey,
            vault,
            bet: betPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([player])
          .rpc();

        expect.fail("Should have thrown TimeoutNotReached error");
      } catch (err) {
        expect(err.toString()).to.contain("TimeoutNotReached");
      }
    });
  });
});
