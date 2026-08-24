"use client";

import { useCallback, useEffect, useMemo } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/base.css";

import { evaluateCourse, neighbourhood, type ProgressionGraph } from "@/lib/prereqs/graph";
import { courseLabel, formatCourseId } from "@/lib/progression/catalog";
import { CourseNode, type CourseFlowNode, type CourseNodeStatus } from "./course-node";
import { NODE_HEIGHT, NODE_WIDTH, layoutGraph } from "./map-layout";

/**
 * The prerequisite map.
 *
 * Scope is the whole design decision here. The full graph is 146 nodes and 148
 * edges, which draws as a hairball nobody can read; the useful view is always
 * "this course and its immediate world". So the map renders a bounded
 * neighbourhood around one focus course, and clicking a node re-centres rather
 * than expanding — the node count stays roughly constant however long you
 * explore.
 *
 * Edge styling carries the one thing a box-and-arrow diagram usually loses:
 * a solid line is a prerequisite you cannot avoid, a dashed line is one of
 * several alternatives, and a dotted line is a corequisite you take alongside.
 * Without that distinction "COMS W3134 → COMS W4111" reads as compulsory when
 * two other courses satisfy it equally well.
 */

const NODE_TYPES = { course: CourseNode };

export interface PrereqMapProps {
  graph: ProgressionGraph;
  focusCourseId: string;
  completed: ReadonlySet<string>;
  onFocusChange: (courseId: string) => void;
  upstream?: number;
  downstream?: number;
  /** Called with how many courses the node budget left off the canvas. */
  onTruncated?: (count: number) => void;
}

/**
 * Roughly three wrapped columns' worth. Past this the map stops being a map,
 * and the detail panel already lists every unlock exhaustively.
 */
const MAX_NODES = 22;

/**
 * Below this the map is illegible, so it stops shrinking and starts panning.
 * Fitting everything on screen is worth less than being able to read it — the
 * off-canvas count in the legend covers the difference.
 */
const MIN_FIT_ZOOM = 0.58;

/**
 * A course with a wide fan-out gets one hop downstream instead of two.
 *
 * COMS W3134 leads to sixteen courses; drawing their successors as well adds a
 * fourth column and halves the zoom to show second-hop courses nobody is
 * looking at yet. The threshold is where one hop is already a full canvas.
 */
const WIDE_FAN_OUT = 6;

export function PrereqMap(props: PrereqMapProps) {
  return (
    <ReactFlowProvider>
      <PrereqMapCanvas {...props} />
    </ReactFlowProvider>
  );
}

function PrereqMapCanvas({
  graph,
  focusCourseId,
  completed,
  onFocusChange,
  upstream = 2,
  downstream,
  onTruncated,
}: PrereqMapProps) {
  const resolvedDownstream =
    downstream ?? ((graph.unlocks.get(focusCourseId)?.length ?? 0) > WIDE_FAN_OUT ? 1 : 2);

  const { nodes: layoutNodes, edges: flowEdges, truncated } = useMemo(
    () =>
      buildFlow(graph, focusCourseId, completed, {
        upstream,
        downstream: resolvedDownstream,
      }),
    [graph, focusCourseId, completed, upstream, resolvedDownstream],
  );

  useEffect(() => {
    onTruncated?.(truncated);
  }, [truncated, onTruncated]);

  const [nodes, setNodes, onNodesChange] = useNodesState<CourseFlowNode>(layoutNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(flowEdges);
  const { fitView } = useReactFlow();

  // The layout is recomputed from scratch on every focus change, so the flow
  // state is replaced rather than merged — merging would preserve stale
  // positions from the previous neighbourhood.
  useEffect(() => {
    setNodes(layoutNodes);
    setEdges(flowEdges);
    const frame = requestAnimationFrame(() => {
      void fitView({ padding: 0.14, duration: 320, minZoom: MIN_FIT_ZOOM, maxZoom: 1 });
    });
    return () => cancelAnimationFrame(frame);
  }, [layoutNodes, flowEdges, setNodes, setEdges, fitView]);

  const handleNodeClick = useCallback<NodeMouseHandler<CourseFlowNode>>(
    (_event, node) => {
      // External courses have no prerequisites of their own to show, so
      // re-centring on one would produce an empty map.
      if (node.data.isExternal || node.id === focusCourseId) return;
      onFocusChange(node.id);
    },
    [focusCourseId, onFocusChange],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={handleNodeClick}
      nodesConnectable={false}
      nodesDraggable
      elementsSelectable
      proOptions={{ hideAttribution: false }}
      minZoom={0.3}
      maxZoom={1.6}
      className="[&_.react-flow\_\_controls-button]:border-border-table [&_.react-flow\_\_controls-button]:bg-background-primary-default [&_.react-flow\_\_controls-button]:fill-text-secondary"
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={20}
        size={1}
        className="[&_circle]:fill-border-table"
      />
      <Controls showInteractive={false} position="bottom-right" />
    </ReactFlow>
  );
}

// ---------------------------------------------------------------------------

const EDGE_STYLE = {
  required: { strokeDasharray: undefined, opacity: 0.9 },
  alternative: { strokeDasharray: "5 4", opacity: 0.65 },
  corequisite: { strokeDasharray: "1 5", opacity: 0.65 },
} as const;

function buildFlow(
  graph: ProgressionGraph,
  focusCourseId: string,
  completed: ReadonlySet<string>,
  hops: { upstream: number; downstream: number },
): { nodes: CourseFlowNode[]; edges: Edge[]; truncated: number } {
  const scope = neighbourhood(graph, focusCourseId, { ...hops, maxNodes: MAX_NODES });

  const layout = layoutGraph({
    courseIds: scope.courseIds,
    edges: scope.edges,
    depthOf: (courseId) => graph.depth.get(courseId) ?? 0,
  });

  const nodes: CourseFlowNode[] = layout.nodes.map((placed) => {
    const course = graph.courses.get(placed.courseId);
    const isExternal = !course;

    return {
      id: placed.courseId,
      type: "course",
      position: { x: placed.x, y: placed.y },
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      data: {
        code: courseLabel(graph, placed.courseId),
        title: course?.title ?? formatCourseId(placed.courseId),
        points: course?.points ?? null,
        status: statusOf(graph, placed.courseId, completed, isExternal),
        unlockCount: (graph.unlocks.get(placed.courseId) ?? []).length,
        isFocus: placed.courseId === focusCourseId,
        isExternal,
      },
    };
  });

  const edges: Edge[] = scope.edges.map((edge) => ({
    id: `${edge.from}->${edge.to}:${edge.kind}`,
    source: edge.from,
    target: edge.to,
    type: "smoothstep",
    animated: false,
    style: {
      stroke: "var(--color-border-table)",
      strokeWidth: edge.kind === "required" ? 1.75 : 1.25,
      ...EDGE_STYLE[edge.kind],
    },
  }));

  return { nodes, edges, truncated: scope.truncated };
}

function statusOf(
  graph: ProgressionGraph,
  courseId: string,
  completed: ReadonlySet<string>,
  isExternal: boolean,
): CourseNodeStatus {
  if (completed.has(courseId)) return "completed";
  if (isExternal) return "external";
  return evaluateCourse(graph, courseId, completed).status;
}
