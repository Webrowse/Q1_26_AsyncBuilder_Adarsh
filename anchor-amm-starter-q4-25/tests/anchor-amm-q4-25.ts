import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  createMint,
  mintTo,
  getOrCreateAssociatedTokenAccount,
  getAccount,
} from "@solana/spl-token";
import { assert } from "chai";
import { AnchorAmmQ425 } from "../target/types/anchor_amm_q4_25";

describe("anchor-amm-q4-25", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.anchorAmmQ425 as Program<AnchorAmmQ425>;
  const payer = (provider.wallet as anchor.Wallet).payer;

  const seed = new anchor.BN(Math.floor(Math.random() * 1_000_000));
  const fee = 30; // 0.3% in basis points

  let mintX: PublicKey;
  let mintY: PublicKey;
  let configPda: PublicKey;
  let mintLpPda: PublicKey;
  let vaultX: PublicKey;
  let vaultY: PublicKey;
  let userAtaX: PublicKey;
  let userAtaY: PublicKey;

  // Expiration far in the future
  const expiration = new anchor.BN(Math.floor(Date.now() / 1000) + 600);

  // Amounts
  const initialDepositX = 1_000_000_000; // 1000 tokens (6 decimals)
  const initialDepositY = 1_000_000_000;
  const lpAmount = new anchor.BN(1_000_000); // LP tokens to claim on first deposit

  it("Initializes the pool", async () => {
    // Create two token mints
    mintX = await createMint(
      provider.connection,
      payer,
      provider.wallet.publicKey,
      null,
      6
    );

    mintY = await createMint(
      provider.connection,
      payer,
      provider.wallet.publicKey,
      null,
      6
    );

    // Derive config PDA
    [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config"), seed.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    // Derive mint_lp PDA
    [mintLpPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("lp"), configPda.toBuffer()],
      program.programId
    );

    const tx = await program.methods
      .initialize(seed, fee, provider.wallet.publicKey)
      .accounts({
        mintX,
        mintY,
      })
      .rpc();
    console.log("Initialize tx:", tx);

    // Verify config account
    const config = await program.account.config.fetch(configPda);
    assert.equal(config.seed.toNumber(), seed.toNumber());
    assert.equal(config.fee, 30);
    assert.isFalse(config.locked);
    assert.deepEqual(config.mintX, mintX);
    assert.deepEqual(config.mintY, mintY);
    assert.deepEqual(config.authority, provider.wallet.publicKey);
  });

  it("Deposits initial liquidity", async () => {
    // Create user ATAs and mint tokens to them
    const userAtaXAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      mintX,
      provider.wallet.publicKey
    );
    userAtaX = userAtaXAccount.address;

    const userAtaYAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      mintY,
      provider.wallet.publicKey
    );
    userAtaY = userAtaYAccount.address;

    // Mint tokens to user
    await mintTo(
      provider.connection,
      payer,
      mintX,
      userAtaX,
      payer,
      initialDepositX
    );

    await mintTo(
      provider.connection,
      payer,
      mintY,
      userAtaY,
      payer,
      initialDepositY
    );

    // Verify user received tokens
    const preUserX = await getAccount(provider.connection, userAtaX);
    assert.equal(Number(preUserX.amount), initialDepositX);

    const tx = await program.methods
      .deposit(
        lpAmount,
        new anchor.BN(initialDepositX),
        new anchor.BN(initialDepositY),
        expiration
      )
      .accountsPartial({
        mintX,
        mintY,
        config: configPda,
      })
      .rpc();
    console.log("Deposit tx:", tx);

    // Verify vaults received tokens
    // Derive vault ATAs (config is authority)
    vaultX = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer,
        mintX,
        configPda,
        true
      )
    ).address;

    vaultY = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer,
        mintY,
        configPda,
        true
      )
    ).address;

    const vaultXAccount = await getAccount(provider.connection, vaultX);
    const vaultYAccount = await getAccount(provider.connection, vaultY);
    assert.equal(Number(vaultXAccount.amount), initialDepositX);
    assert.equal(Number(vaultYAccount.amount), initialDepositY);

    // Verify user received LP tokens
    const userLpAta = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer,
        mintLpPda,
        provider.wallet.publicKey,
        false
      )
    ).address;
    const userLpAccount = await getAccount(provider.connection, userLpAta);
    assert.equal(Number(userLpAccount.amount), lpAmount.toNumber());

    // Verify user token balances decreased
    const postUserX = await getAccount(provider.connection, userAtaX);
    const postUserY = await getAccount(provider.connection, userAtaY);
    assert.equal(Number(postUserX.amount), 0);
    assert.equal(Number(postUserY.amount), 0);
  });

  it("Swaps X for Y", async () => {
    // Mint more X tokens for the swap
    const swapAmountIn = 100_000_000; // 100 tokens
    await mintTo(
      provider.connection,
      payer,
      mintX,
      userAtaX,
      payer,
      swapAmountIn
    );

    const preUserX = await getAccount(provider.connection, userAtaX);
    const preUserY = await getAccount(provider.connection, userAtaY);
    const preVaultX = await getAccount(provider.connection, vaultX);
    const preVaultY = await getAccount(provider.connection, vaultY);

    const tx = await program.methods
      .swap(
        true, // is_x: swapping X for Y
        new anchor.BN(swapAmountIn),
        new anchor.BN(1), // min_amount_out: accept any amount > 0
        expiration
      )
      .accountsPartial({
        mintX,
        mintY,
        config: configPda,
      })
      .rpc();
    console.log("Swap X->Y tx:", tx);

    const postUserX = await getAccount(provider.connection, userAtaX);
    const postUserY = await getAccount(provider.connection, userAtaY);
    const postVaultX = await getAccount(provider.connection, vaultX);
    const postVaultY = await getAccount(provider.connection, vaultY);

    // User's X decreased
    assert.isTrue(Number(postUserX.amount) < Number(preUserX.amount));
    // User received Y
    assert.isTrue(Number(postUserY.amount) > Number(preUserY.amount));
    // Vault X increased
    assert.isTrue(Number(postVaultX.amount) > Number(preVaultX.amount));
    // Vault Y decreased
    assert.isTrue(Number(postVaultY.amount) < Number(preVaultY.amount));

    console.log(
      `  Swapped ${swapAmountIn} X -> ${Number(postUserY.amount) - Number(preUserY.amount)} Y`
    );
  });

  it("Swaps Y for X", async () => {
    // Mint Y tokens for the swap
    const swapAmountIn = 50_000_000; // 50 tokens
    await mintTo(
      provider.connection,
      payer,
      mintY,
      userAtaY,
      payer,
      swapAmountIn
    );

    const preUserX = await getAccount(provider.connection, userAtaX);
    const preUserY = await getAccount(provider.connection, userAtaY);

    const tx = await program.methods
      .swap(
        false, // is_x: swapping Y for X
        new anchor.BN(swapAmountIn),
        new anchor.BN(1),
        expiration
      )
      .accountsPartial({
        mintX,
        mintY,
        config: configPda,
      })
      .rpc();
    console.log("Swap Y->X tx:", tx);

    const postUserX = await getAccount(provider.connection, userAtaX);
    const postUserY = await getAccount(provider.connection, userAtaY);

    // User received X
    assert.isTrue(Number(postUserX.amount) > Number(preUserX.amount));
    // User's Y decreased
    assert.isTrue(Number(postUserY.amount) < Number(preUserY.amount));

    console.log(
      `  Swapped ${swapAmountIn} Y -> ${Number(postUserX.amount) - Number(preUserX.amount)} X`
    );
  });

  it("Deposits additional liquidity into existing pool", async () => {
    // Mint more tokens for the second deposit (generous amounts for slippage after swaps)
    const additionalX = 1_000_000_000;
    const additionalY = 1_000_000_000;
    await mintTo(provider.connection, payer, mintX, userAtaX, payer, additionalX);
    await mintTo(provider.connection, payer, mintY, userAtaY, payer, additionalY);

    const preVaultX = await getAccount(provider.connection, vaultX);
    const preVaultY = await getAccount(provider.connection, vaultY);

    const secondLpAmount = new anchor.BN(500_000);

    const tx = await program.methods
      .deposit(
        secondLpAmount,
        new anchor.BN(additionalX),
        new anchor.BN(additionalY),
        expiration
      )
      .accountsPartial({
        mintX,
        mintY,
        config: configPda,
      })
      .rpc();
    console.log("Second deposit tx:", tx);

    const postVaultX = await getAccount(provider.connection, vaultX);
    const postVaultY = await getAccount(provider.connection, vaultY);

    // Vaults should have increased
    assert.isTrue(Number(postVaultX.amount) > Number(preVaultX.amount));
    assert.isTrue(Number(postVaultY.amount) > Number(preVaultY.amount));
  });

  it("Withdraws liquidity", async () => {
    const userLpAta = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer,
        mintLpPda,
        provider.wallet.publicKey,
        false
      )
    ).address;

    const preLp = await getAccount(provider.connection, userLpAta);
    const preUserX = await getAccount(provider.connection, userAtaX);
    const preUserY = await getAccount(provider.connection, userAtaY);

    // Withdraw half of LP tokens
    const withdrawAmount = new anchor.BN(
      Math.floor(Number(preLp.amount) / 2)
    );

    const tx = await program.methods
      .withdraw(
        withdrawAmount,
        new anchor.BN(1), // min_x: accept any amount > 0
        new anchor.BN(1), // min_y: accept any amount > 0
        expiration
      )
      .accountsPartial({
        mintX,
        mintY,
        config: configPda,
      })
      .rpc();
    console.log("Withdraw tx:", tx);

    const postLp = await getAccount(provider.connection, userLpAta);
    const postUserX = await getAccount(provider.connection, userAtaX);
    const postUserY = await getAccount(provider.connection, userAtaY);

    // LP balance should have decreased
    assert.equal(
      Number(postLp.amount),
      Number(preLp.amount) - withdrawAmount.toNumber()
    );
    // User should have received X and Y
    assert.isTrue(Number(postUserX.amount) > Number(preUserX.amount));
    assert.isTrue(Number(postUserY.amount) > Number(preUserY.amount));

    console.log(
      `  Withdrew ${withdrawAmount.toNumber()} LP -> +${Number(postUserX.amount) - Number(preUserX.amount)} X, +${Number(postUserY.amount) - Number(preUserY.amount)} Y`
    );
  });

  it("Locks the pool via update", async () => {
    const tx = await program.methods
      .update(true)
      .accountsPartial({
        authority: provider.wallet.publicKey,
        config: configPda,
      })
      .rpc();
    console.log("Lock pool tx:", tx);

    const config = await program.account.config.fetch(configPda);
    assert.isTrue(config.locked);
  });

  it("Unlocks the pool via update", async () => {
    const tx = await program.methods
      .update(false)
      .accountsPartial({
        authority: provider.wallet.publicKey,
        config: configPda,
      })
      .rpc();
    console.log("Unlock pool tx:", tx);

    const config = await program.account.config.fetch(configPda);
    assert.isFalse(config.locked);
  });
});
