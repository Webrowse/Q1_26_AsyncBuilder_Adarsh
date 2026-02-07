import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { createMint } from "@solana/spl-token";
import { AnchorAmmQ425 } from "../target/types/anchor_amm_q4_25";

describe("anchor-amm-q4-25", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.anchorAmmQ425 as Program<AnchorAmmQ425>;

  // Test parameters
  const seed = new anchor.BN(1);
  const fee = 30; // 0.3% in basis points

  let mintX: PublicKey;
  let mintY: PublicKey;

  it("Is initialized!", async () => {
    // Create two token mints for the pool
    mintX = await createMint(
      provider.connection,
      (provider.wallet as anchor.Wallet).payer,
      provider.wallet.publicKey,
      null,
      6
    );

    mintY = await createMint(
      provider.connection,
      (provider.wallet as anchor.Wallet).payer,
      provider.wallet.publicKey,
      null,
      6
    );

    // Add your test here.
    const tx = await program.methods
      .initialize(seed, fee, null)
      .accounts({
        mintX,
        mintY,
      })
      .rpc();
    console.log("Your transaction signature", tx);
  });
});
