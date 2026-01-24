import wallet from "./wallet/turbine3-wallet.json"
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults"
import { createGenericFile, createSignerFromKeypair, signerIdentity } from "@metaplex-foundation/umi"
import { irysUploader } from "@metaplex-foundation/umi-uploader-irys"

// Create a devnet connection
const umi = createUmi('https://api.devnet.solana.com');

let keypair = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(wallet));
const signer = createSignerFromKeypair(umi, keypair);

umi.use(irysUploader({address: "https://devnet.irys.xyz/"}));
umi.use(signerIdentity(signer));

(async () => {
    try {
        // Follow this JSON structure
        // https://developers.metaplex.com/smart-contracts/token-metadata/token-standard

        const image = "https://gateway.irys.xyz/8ST6EMF67NxnGSdSErKg8ip9csnooFyeCdoeNVFTDDP"
        const metadata = {
            name: "Pink Domain",
            symbol: "PiDo",
            description: "A Unique pastel rug",
            image: image,
            attributes: [
                {trait_type: 'colors', value: '5'},
                {trait_type: 'type', value: 'Pastel'},
                {trait_type: 'stolen from', value: 'Berg Abman Github'}
            ],
            properties: {
                files: [
                    {
                        type: "image/png",
                        uri: image
                    },
                ]
            },
            creators: []
        };
        const myUri = await umi.uploader.uploadJson(metadata)
        console.log("Your metadata URI: ", myUri);
    }
    catch(error) {
        console.log("Oops.. Something went wrong", error);
    }
})();

// ------------ Result -------------
// Your metadata URI:  https://gateway.irys.xyz/8uYmBF6UoMZZTrweJ8LBkDCTy3Wxaw2MMvDkAov1xh7y