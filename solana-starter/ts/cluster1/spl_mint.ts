import { Keypair, PublicKey, Connection, Commitment } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount, mintTo } from '@solana/spl-token';
import wallet from "./wallet/turbine3-wallet.json"

// Import our keypair from the wallet file
const keypair = Keypair.fromSecretKey(new Uint8Array(wallet));

//Create a Solana devnet connection
const commitment: Commitment = "confirmed";
const connection = new Connection("https://api.devnet.solana.com", commitment);

const token_decimals = 1_000_000n;

// Mint address
const mint = new PublicKey("6D4AtdeMiC8c8jNVqYjWqHvTwt46C5Hr7S6Z9ANmsxTM");

(async () => {
    try {
        // Create an ATA
        const ata = await getOrCreateAssociatedTokenAccount(
            connection,
            keypair,
            mint,
            keypair.publicKey
        );
        console.log(`Your ata is: ${ata.address.toBase58()}`);

        // Mint to ATA
        const mintTx = await mintTo(
            connection,
            keypair,
            mint,
            ata.address,
            keypair.publicKey,
            1_000_000_000,
        );
        console.log(`Your mint txid: ${mintTx}`);
    } catch(error) {
        console.log(`Oops, something went wrong: ${error}`)
    }
})()

// ------------ Result -------------
// Your ata is: AeFppBK2C3q292VtrnqzGzUEJbnoCMg8zcJTeH8By8h6

// Your mint txid: Pa82jeD4MPefAdDYynQMfSRpuoWJEHBcuBeeWYHfmAQCV6VSHqXYsUfF5M5mY6zUQNbh6S1KQoYhqb8HGc12SHR