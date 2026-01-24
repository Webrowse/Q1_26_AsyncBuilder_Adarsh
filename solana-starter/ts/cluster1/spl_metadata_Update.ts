import wallet from "./wallet/turbine3-wallet.json";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  updateMetadataAccountV2,
  findMetadataPda,
  DataV2Args,
} from "@metaplex-foundation/mpl-token-metadata";
import {
  createSignerFromKeypair,
  signerIdentity,
  publicKey,
} from "@metaplex-foundation/umi";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";

const mint = publicKey("6D4AtdeMiC8c8jNVqYjWqHvTwt46C5Hr7S6Z9ANmsxTM");

const umi = createUmi("https://api.devnet.solana.com");
const keypair = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(wallet));
const signer = createSignerFromKeypair(umi, keypair);
umi.use(signerIdentity(signer));

(async () => {
  try {
    const metadataPda = findMetadataPda(umi, { mint });

    const data: DataV2Args = {
      name: "Rusty",
      symbol: "RSTY",
      uri: "https://gateway.lighthouse.storage/ipfs/bafkreigqezlqc5jcewb6g6jumjbsz2w6kl2pljhkajmypruvexf5bciqdy",
      sellerFeeBasisPoints: 0,
      creators: null,
      collection: null,
      uses: null,
    };

    const tx = updateMetadataAccountV2(umi, {
      metadata: metadataPda,
      updateAuthority: signer,
      data,
      primarySaleHappened: null,
      isMutable: true,
    });

    const result = await tx.sendAndConfirm(umi);
    console.log(bs58.encode(result.signature));
  } catch (e) {
    console.error(e);
  }
})();
