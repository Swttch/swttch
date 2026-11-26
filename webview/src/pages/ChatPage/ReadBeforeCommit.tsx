import { Component } from 'react';

interface Props {
  /** Changes with whatever the screen is about to be changed for. */
  when: string;
  read: () => void;
}

/**
 * Calls `read` right before React writes to the screen, in a commit where `when` changes (#747).
 *
 * The one moment a screen can be read as the reader has it and no later change can be made to it: a render can be
 * set aside and taken up again, with the reader scrolling in between (see `startTransition` in useChatStream), so
 * what is read while rendering can be old by the time the page is drawn. A class, because React offers this moment
 * (`getSnapshotBeforeUpdate`) to nothing else.
 */
export class ReadBeforeCommit extends Component<Props> {
  getSnapshotBeforeUpdate(previous: Props) {
    if (previous.when !== this.props.when) this.props.read();
    return null;
  }

  // React asks for it beside getSnapshotBeforeUpdate.
  componentDidUpdate() {}

  render() {
    return null;
  }
}
