/**
 * The assistant surface.
 *
 * `AssistantHome` is the only client entry point; everything else here is a
 * leaf it renders. `SourceList` is exported separately because it is a server
 * component and other surfaces may want the same evidence rail.
 */

export { AssistantHome } from "./assistant-home";
export type { AssistantHomeProps } from "./assistant-home";
export { SourceList } from "./source-list";
