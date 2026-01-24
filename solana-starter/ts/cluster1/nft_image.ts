import wallet from "./wallet/turbine3-wallet.json"
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults"
import { createGenericFile, createSignerFromKeypair, signerIdentity } from "@metaplex-foundation/umi"
import { irysUploader } from "@metaplex-foundation/umi-uploader-irys"
import { readFile } from "fs/promises"

// Create a devnet connection
const umi = createUmi('https://api.devnet.solana.com');

let keypair = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(wallet));
const signer = createSignerFromKeypair(umi, keypair);

umi.use(irysUploader({address: "https://devnet.irys.xyz"}));
umi.use(signerIdentity(signer));

// https://arveave.net/<hash>
// https://devnet.irys.xyz/<hash>


(async () => {
    try {
        //1. Load image
        //2. Convert image to generic file.
        //3. Upload image
        const image = await readFile("./cluster1/generug.png");
        // const image = ???
        
        const genericFile = createGenericFile(image, "generug.png", {
            contentType: "image/png"
        })
        const [myUri] = await umi.uploader.upload([genericFile]);
        console.log("Your image URI: ", myUri);
    }
    catch(error) {
        console.log("Oops.. Something went wrong", error);
    }
})();
// ------------ Result -------------
// Your image URI:  https://gateway.irys.xyz/8ST6EMF67NxnGSdSErKg8ip9csnooFyeCdoeNVFTDDP