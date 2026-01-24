import { Commitment, Connection, Keypair, /*LAMPORTS_PER_SOL,*/ PublicKey } from "@solana/web3.js"
import wallet from "./wallet/turbine3-wallet.json"
import { getOrCreateAssociatedTokenAccount, /*TOKEN_PROGRAM_ID,*/ transfer } from "@solana/spl-token";
// import { signerPayer } from "@metaplex-foundation/umi";

// We're going to import our keypair from the wallet file
const keypair = Keypair.fromSecretKey(new Uint8Array(wallet));

//Create a Solana devnet connection
const commitment: Commitment = "confirmed";
const connection = new Connection("https://api.devnet.solana.com", commitment);

// Mint address
const mint = new PublicKey("6D4AtdeMiC8c8jNVqYjWqHvTwt46C5Hr7S6Z9ANmsxTM");

// Recipient address
const to = new PublicKey("BHkdzFCio83A22Kw8x7fwUmBYFmztSbg3RgzJpXacVYM");


(async () => {
    try {
        // Get the token account of the fromWallet address, and if it does not exist, create it
        const fromWallet = await getOrCreateAssociatedTokenAccount(
            connection,
            keypair,
            mint,
            keypair.publicKey,
        )
        console.log("The fromWallet ATA created "+fromWallet.address);
        
        // Get the token account of the toWallet address, and if it does not exist, create it
        const toWallet = await getOrCreateAssociatedTokenAccount(
            connection,
            keypair,
            mint,
            to,
        )
        console.log("The toWallet ATA created "+ toWallet.address);

        // Transfer the new token to the "toTokenAccount" we just created
        const toTokenAccount = await transfer (
            connection,
            keypair,
            fromWallet.address,
            toWallet.address,
            keypair.publicKey,
            10_000_000
        )

        console.log("transfer is taken out " + toTokenAccount);

    } catch(e) {
        console.error(`Oops, something went wrong: ${e}`)
    }
})();