/**
 * The name a picture gives its maker: the server of an MCP tool
 * (`mcp__Claude_Browser__computer` reads `Claude Browser`), the tool's own name otherwise.
 */
export function toolLabel(name: string): string {
    const parts = name.split('__');
    const server = parts[0] === 'mcp' && parts.length >= 3 ? parts[1] : name;
    return server.replace(/[_-]+/g, ' ').trim() || name;
}
