import { createUmi } from "@metaplex-foundation/umi-bundle-defaults"
import { createSignerFromKeypair, signerIdentity, generateSigner, percentAmount } from "@metaplex-foundation/umi"
import { createNft, mplTokenMetadata } from "@metaplex-foundation/mpl-token-metadata";

import wallet from "./wallet/turbine3-wallet.json"
import base58 from "bs58";

const RPC_ENDPOINT = "https://api.devnet.solana.com";
const umi = createUmi(RPC_ENDPOINT);

let keypair = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(wallet));
const myKeypairSigner = createSignerFromKeypair(umi, keypair);
umi.use(signerIdentity(myKeypairSigner));
umi.use(mplTokenMetadata())

const mint = generateSigner(umi);

(async () => {
    let tx = await createNft(umi, {
        mint,
        sellerFeeBasisPoints: percentAmount(5.5),
        name: 'Pink Domain',
        symbol: "PiDo",
        isMutable: true,
        uri: "https://gateway.irys.xyz/8uYmBF6UoMZZTrweJ8LBkDCTy3Wxaw2MMvDkAov1xh7y",
    })
    
    let result = await tx.sendAndConfirm(umi);
    const signature = base58.encode(result.signature);

    console.log(`Succesfully Minted! Check out your TX here:\nhttps://explorer.solana.com/tx/${signature}?cluster=devnet`)

    console.log("Mint Address: ", mint.publicKey);
})();

// ------------ Result -------------
// Succesfully Minted! Check out your TX here:
// https://explorer.solana.com/tx/3orBhtRJFUDhCm4NR2fiNoGujuoL7q2jBBFV7L7rpwEDGtdnnpTA2DvSrvA41y7hc7fBJaGBjyeSS6TFzoyvSnit?cluster=devnet
// Mint Address:  Ds4ZNNDtZVU3bnN5xfA5P4Xqk3tQUDidgBbDz8egpnRL