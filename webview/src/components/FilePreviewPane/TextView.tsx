/**
 * A text file as code: a gutter of line numbers and the lines themselves in a
 * monospaced face, the way Claude Desktop's file viewer shows a file it cannot
 * render. Long lines scroll sideways instead of wrapping, so a table or a log
 * keeps its columns.
 */
export function TextView({ text }: { text: string }) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  // A file that ends in a newline does not have one more, empty, line.
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  const gutter = String(lines.length).length;

  return (
    <div className="absolute inset-0 overflow-auto bg-inherit py-3 font-mono text-[0.8125rem] leading-5" dir="ltr">
      <table className="border-collapse">
        <tbody>
          {lines.map((line, index) => (
            <tr key={index}>
              <td
                className="select-none pe-4 ps-4 text-end align-top opacity-40"
                style={{ minWidth: `${gutter + 2}ch` }}
              >
                {index + 1}
              </td>
              <td className="whitespace-pre pe-6">{line === '' ? ' ' : line}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
