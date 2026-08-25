/**
 * The assistant surface.
 *
 * `AssistantHome` is the only client entry point; everything else here is a
 * leaf it renders. `SourceList` is a client accordion — other surfaces can
 * still import the same evidence list.
 */

export { AssistantHome } from "./assistant-home";
export type { AssistantHomeProps } from "./assistant-home";
export { SourceList } from "./source-list";
