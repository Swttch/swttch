# You can scroll up while an answer is still streaming in

> Languages: **English** · [한국어](./ko.md)
>
> Related: [#530](https://github.com/Swttch/swttch/issues/530) · see also [The view stays where you put it while you read](../023-auto_scroll_stays_put/en.md)

## What was wrong

While Claude was writing an answer, scrolling up to read something above did not work the way it does anywhere else. You moved the view up a little, and a moment later it jumped back to the bottom. Move up again, and it jumped back again. The only way out was one fast, long scroll.

The report that started this ([#530](https://github.com/Swttch/swttch/issues/530)) said it in one line: you cannot scroll as the AI is writing, it just keeps snapping the scroll back to the bottom.

The cause is a setting you may know already, **Auto-scroll resume distance** (Settings → Appearance → Scrolling, 80 pixels by default). Within that many pixels of the bottom, the chat counts as following the answer, and every new line of text pulls the view down to the new bottom. That is the right thing for someone who is watching the bottom.

But a reader who is only starting to scroll up is still inside that distance for the first few moves. New text arrives every few tenths of a second, and each time it arrived, the pull took the view back to the bottom before the next move could land. Moving slowly never got you out. Only a move longer than the whole distance, made faster than the answer grew, did.

## What changed

The pull to the bottom now **waits while you keep moving the view up**. As long as your last move up was less than half a second ago, new text does not take the view anywhere. You can scroll up slowly, with a mouse wheel, a trackpad or the scrollbar, and the view stays under your hand.

What happens next is the same as before:

| What you do | What the chat does |
|-------------|--------------------|
| Keep scrolling up, past the resume distance | Auto-scroll stops and the **Scroll to bottom** button appears. The view stays where you put it however long you stop |
| Scroll up a little and stop inside the resume distance | Half a second after your last move, the next new text takes the view back to the bottom |
| Scroll up and then turn around and scroll down | The waiting ends the moment you move down, so the view follows the answer again |
| Send a message | The view follows the reply at once, even if you had just moved up |

## What did not change

- **The resume distance setting is still the boundary.** Inside it the chat follows, past it the chat lets go. Raise it and you have to go further to leave, lower it and you leave sooner.
- **Stopping inside the distance still returns you to the bottom.** The distance is the "I am basically at the bottom" zone. If you want to stop and read within the last few lines of an answer that is still growing, lower the setting.
- **The half second is fixed.** It is not a setting. It is long enough to cover the pause between two notches of a mouse wheel.
- **Nothing changes when no answer is streaming.** The pull only happens when new content arrives.

The same rule applies in the detail windows for agents and background tasks, because they follow their output with the same code as the main chat.

## If it still jumps back

1. Scroll further than the resume distance in one go. If that works, you were inside the distance, which is the behaviour described above. Lower **Auto-scroll resume distance** if you want to leave sooner.
2. Check the version in **Settings → About**. This change is in the release that lists [#530](https://github.com/Swttch/swttch/issues/530) in its notes.
3. If the view still returns to the bottom while you are moving it past the resume distance, please tell us on [#530](https://github.com/Swttch/swttch/issues/530) with your version, your IDE or browser, and the input device you use (mouse wheel, trackpad, scrollbar).
