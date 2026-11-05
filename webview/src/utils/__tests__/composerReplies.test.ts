import { beforeEach, describe, expect, it } from "vitest";
import { parseReplyBlocks } from "@/pages/ChatPage/message-renderers/utils/replyBlocks";
import { addReplyToComposer, expandReplyCards, getPendingReplies, removePendingReply } from "../composerReplies";

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

  it("takes one card out of the row", () => {
    addReplyToComposer("a", "x");
    addReplyToComposer("b", "y");
    removePendingReply(getPendingReplies()[0].id);
    expect(getPendingReplies().map((entry) => entry.quote)).toEqual(["b"]);
  });
});
