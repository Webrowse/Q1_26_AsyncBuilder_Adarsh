import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AnchorQuadraticVoting } from "../target/types/anchor_quadratic_voting";
import { expect } from "chai";
import BN from "bn.js";

describe("anchor-quadratic-voting", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace
    .anchorQuadraticVoting as Program<AnchorQuadraticVoting>;

  const provider = anchor.getProvider() as anchor.AnchorProvider;

  // Helper to derive poll PDA
  function pollPda(pollId: BN) {
    return anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("poll"), pollId.toArrayLike(Buffer, "le", 8)],
      program.programId
    )[0];
  }

  // Helper to derive candidate PDA
  function candidatePda(pollId: BN, name: string) {
    return anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("candidate"),
        pollId.toArrayLike(Buffer, "le", 8),
        Buffer.from(name),
      ],
      program.programId
    )[0];
  }

  // ── Happy Path ──────────────────────────────────────────────

  describe("Happy path", () => {
    const pollId = new BN(1);

    it("initializes a poll", async () => {
      const now = Math.floor(Date.now() / 1000);
      const pollStart = new BN(now);
      const pollEnd = new BN(now + 86400);

      await program.methods
        .initialisePoll(pollId, pollStart, pollEnd)
        .accounts({ signer: provider.publicKey })
        .rpc();

      const pollAccount = await program.account.poll.fetch(pollPda(pollId));
      expect(pollAccount.pollId.toNumber()).to.equal(1);
      expect(pollAccount.candidates.toNumber()).to.equal(0);
    });

    it("initializes candidates", async () => {
      await program.methods
        .initialiseCandidate("Alice", pollId)
        .accounts({ signer: provider.publicKey })
        .rpc();

      await program.methods
        .initialiseCandidate("Bob", pollId)
        .accounts({ signer: provider.publicKey })
        .rpc();

      const candidateA = await program.account.candidate.fetch(
        candidatePda(pollId, "Alice")
      );
      expect(candidateA.candidateName).to.equal("Alice");
      expect(candidateA.candidateVotes.toNumber()).to.equal(0);

      const pollAccount = await program.account.poll.fetch(pollPda(pollId));
      expect(pollAccount.candidates.toNumber()).to.equal(2);
    });

    it("casts quadratic votes for Alice", async () => {
      const numVotes = new BN(3);

      await program.methods
        .vote("Alice", pollId, numVotes)
        .accounts({ signer: provider.publicKey })
        .rpc();

      const candidateA = await program.account.candidate.fetch(
        candidatePda(pollId, "Alice")
      );
      expect(candidateA.candidateVotes.toNumber()).to.equal(3);
    });

    it("casts votes for Bob", async () => {
      const numVotes = new BN(2);

      await program.methods
        .vote("Bob", pollId, numVotes)
        .accounts({ signer: provider.publicKey })
        .rpc();

      const candidateBob = await program.account.candidate.fetch(
        candidatePda(pollId, "Bob")
      );
      expect(candidateBob.candidateVotes.toNumber()).to.equal(2);
    });

    it("accumulates multiple votes for same candidate", async () => {
      // Alice already has 3 votes from earlier; cast 2 more
      await program.methods
        .vote("Alice", pollId, new BN(2))
        .accounts({ signer: provider.publicKey })
        .rpc();

      const candidateA = await program.account.candidate.fetch(
        candidatePda(pollId, "Alice")
      );
      expect(candidateA.candidateVotes.toNumber()).to.equal(5); // 3 + 2
    });

    it("allows a different user to vote", async () => {
      const voter2 = anchor.web3.Keypair.generate();

      // Airdrop SOL to voter2 for tx fees
      const sig = await provider.connection.requestAirdrop(
        voter2.publicKey,
        1 * anchor.web3.LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig);

      await program.methods
        .vote("Bob", pollId, new BN(1))
        .accounts({ signer: voter2.publicKey })
        .signers([voter2])
        .rpc();

      const candidateBob = await program.account.candidate.fetch(
        candidatePda(pollId, "Bob")
      );
      // Bob had 2 votes, now 3
      expect(candidateBob.candidateVotes.toNumber()).to.equal(3);
    });
  });

  // ── Error: Poll Timing ──────────────────────────────────────

  describe("Poll timing errors", () => {
    const futurePollId = new BN(10);
    const pastPollId = new BN(11);

    it("rejects voting before poll starts", async () => {
      const now = Math.floor(Date.now() / 1000);
      // Poll starts 1 hour from now
      const pollStart = new BN(now + 3600);
      const pollEnd = new BN(now + 7200);

      await program.methods
        .initialisePoll(futurePollId, pollStart, pollEnd)
        .accounts({ signer: provider.publicKey })
        .rpc();

      await program.methods
        .initialiseCandidate("Charlie", futurePollId)
        .accounts({ signer: provider.publicKey })
        .rpc();

      try {
        await program.methods
          .vote("Charlie", futurePollId, new BN(1))
          .accounts({ signer: provider.publicKey })
          .rpc();
        expect.fail("Expected PollNotStarted error");
      } catch (err: any) {
        expect(err.error.errorCode.code).to.equal("PollNotStarted");
        expect(err.error.errorCode.number).to.equal(6000);
      }
    });

    it("rejects voting after poll ends", async () => {
      // Poll that already ended (start and end in the past)
      const pollStart = new BN(1000);
      const pollEnd = new BN(2000);

      await program.methods
        .initialisePoll(pastPollId, pollStart, pollEnd)
        .accounts({ signer: provider.publicKey })
        .rpc();

      await program.methods
        .initialiseCandidate("Dave", pastPollId)
        .accounts({ signer: provider.publicKey })
        .rpc();

      try {
        await program.methods
          .vote("Dave", pastPollId, new BN(1))
          .accounts({ signer: provider.publicKey })
          .rpc();
        expect.fail("Expected PollEnded error");
      } catch (err: any) {
        expect(err.error.errorCode.code).to.equal("PollEnded");
        expect(err.error.errorCode.number).to.equal(6001);
      }
    });
  });

  // ── Error: Invalid Poll Duration ────────────────────────────

  describe("Poll validation errors", () => {
    it("rejects poll with start >= end", async () => {
      const invalidPollId = new BN(20);
      const now = Math.floor(Date.now() / 1000);

      try {
        await program.methods
          .initialisePoll(invalidPollId, new BN(now + 200), new BN(now + 100))
          .accounts({ signer: provider.publicKey })
          .rpc();
        expect.fail("Expected InvalidPollDuration error");
      } catch (err: any) {
        expect(err.error.errorCode.code).to.equal("InvalidPollDuration");
        expect(err.error.errorCode.number).to.equal(6004);
      }
    });

    it("rejects poll with start == end", async () => {
      const invalidPollId = new BN(21);
      const ts = new BN(Math.floor(Date.now() / 1000) + 100);

      try {
        await program.methods
          .initialisePoll(invalidPollId, ts, ts)
          .accounts({ signer: provider.publicKey })
          .rpc();
        expect.fail("Expected InvalidPollDuration error");
      } catch (err: any) {
        expect(err.error.errorCode.code).to.equal("InvalidPollDuration");
        expect(err.error.errorCode.number).to.equal(6004);
      }
    });
  });

  // ── Error: Zero Votes ───────────────────────────────────────

  describe("Vote validation errors", () => {
    it("rejects zero votes", async () => {
      // Use poll 1 which is active and has candidates
      const pollId = new BN(1);

      try {
        await program.methods
          .vote("Alice", pollId, new BN(0))
          .accounts({ signer: provider.publicKey })
          .rpc();
        expect.fail("Expected ZeroVotes error");
      } catch (err: any) {
        expect(err.error.errorCode.code).to.equal("ZeroVotes");
        expect(err.error.errorCode.number).to.equal(6003);
      }
    });
  });

  // ── Error: Duplicate Candidate ──────────────────────────────

  describe("Duplicate candidate", () => {
    it("rejects initializing the same candidate twice", async () => {
      const pollId = new BN(1);

      try {
        // "Alice" was already initialized for poll 1
        await program.methods
          .initialiseCandidate("Alice", pollId)
          .accounts({ signer: provider.publicKey })
          .rpc();
        expect.fail("Expected error for duplicate candidate");
      } catch (err: any) {
        // Anchor throws a constraint error when trying to init an already-existing PDA
        expect(err).to.exist;
      }
    });
  });
});
