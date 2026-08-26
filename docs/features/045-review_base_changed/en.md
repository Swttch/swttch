# You're told when the file changes while you're reviewing

When Claude proposes a file edit, we read the file at that moment and build the diff you see.

But it takes time before you press approve. The file can keep changing in between — you were editing it in the IDE, another session touched the same file, you switched branches.

Until now, we did **not** read the file again when you approved. We wrote what we had read the first time.

So anything that arrived in between disappeared without any check. One report had a 1,090-line file come back as a single line, taking uncommitted work with it ([#359](https://github.com/Swttch/swttch/issues/359)).

From this release, **you're told when the file changes, and an approval won't go through while it's stale.**

## You're told while you're still reading

Save a file that has a review waiting on it in the IDE, and a notice appears above the diff.

It appears before you press approve, so you don't do the work twice.

## Approving checks again

You might have missed the notice, or the detection might have been late.

So the file is read again at the moment you press approve. If it differs from what the review was built on, **nothing is written and it stops there.**

The request isn't lost. It stays open, so you can sort things out and approve again.

## The Refresh button

Press **Refresh** in the notice and the proposal is rebuilt against the file as it is on disk right now.

Approve after that and it applies on top of the current file, so the work you had in progress doesn't disappear.

One thing to know: **your per-hunk picks are reset.** Those picks point at line numbers in the file as it was before the change, so carrying them over would point them at the wrong lines. Please pick again.

## When the same lines overlap

If the part Claude wants to change and the part that changed in the meantime are different places, Refresh sorts it out cleanly.

The hard case is **the same lines changed differently on both sides.**

We don't merge that for you. We can't tell which one is right, and a bad merge would quietly cause the same accident this release fixes. git hands this back to a person too.

Instead we tell you plainly that they overlap. Look at the current file and decide yourself.

## When the file is gone

If the file was deleted while the review was waiting, there's nothing to apply the change to.

No Refresh button appears in that case. We can't offer a way back, so we only tell you what happened.

## In the browser

Detecting a save is possible because the IDE tells us. That notice doesn't appear when you're using a browser.

But **the check at approval time works everywhere.** Your file won't disappear in the browser either.
