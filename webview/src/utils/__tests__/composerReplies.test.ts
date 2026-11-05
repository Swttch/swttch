import { beforeEach, describe, expect, it } from "vitest";
import { parseReplyBlocks } from "@/pages/ChatPage/message-renderers/utils/replyBlocks";
import { addReplyToComposer, expandReplyCards, getPendingReplies, removePendingReply, updatePendingReply } from "../composerReplies";

beforeEach(() => {
  getPendingReplies().forEach((entry) => removePendingReply(entry.id));
});

describe("composerReplies", () => {
  it("leaves the message alone when no card waits", () => {
    expect(expandReplyCards("hello")).toBe("hello");
  });

  it("writes the cards ahead of the typed text and empties the row", () => {
    addReplyToComposer("quoted", "my comment");
    addReplyToComposer("only quoted", "   ");
    const sent = expandReplyCards("typed text");
    expect(parseReplyBlocks(sent)).toEqual({
      replies: [{ quote: "quoted", comment: "my comment" }],
      excerpts: ["only quoted"],
      body: "typed text",
    });
    expect(getPendingReplies()).toHaveLength(0);
  });

  it("sends the cards alone when nothing was typed", () => {
    addReplyToComposer("quoted", "my comment");
    expect(parseReplyBlocks(expandReplyCards(""))?.body).toBe("");
  });

  it("rewrites a comment, and a comment emptied or added turns the card into an excerpt or a reply", () => {
    addReplyToComposer("quoted", "first");
    const id = getPendingReplies()[0].id;
    updatePendingReply(id, "  second  ");
    expect(getPendingReplies()[0].comment).toBe("second");
    updatePendingReply(id, "   ");
    expect(parseReplyBlocks(expandReplyCards(""))).toEqual({ replies: [], excerpts: ["quoted"], body: "" });
    addReplyToComposer("other", "");
    updatePendingReply(getPendingReplies()[0].id, "now a reply");
    expect(parseReplyBlocks(expandReplyCards(""))?.replies).toEqual([{ quote: "other", comment: "now a reply" }]);
  });

  it("takes one card out of the row", () => {
    addReplyToComposer("a", "x");
    addReplyToComposer("b", "y");
    removePendingReply(getPendingReplies()[0].id);
    expect(getPendingReplies().map((entry) => entry.quote)).toEqual(["b"]);
  });
});
