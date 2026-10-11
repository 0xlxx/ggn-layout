/**
 * mrtree DFSTreeifyer — ELK alg.mrtree.p1treeify.DFSTreeifyer 0.12.0.
 * DFS/BFS 找环边, 移出图结构存入 REMOVABLE_EDGES (P4 后 Untreeifyer 插回).
 * 节点重编号 id.
 */
import { TGraph, TNode, TEdge, P_REMOVABLE_EDGES, setProp } from '../graph.js'
import { SEARCH_ORDER, TreeifyingOrder } from '../options.js'

export function dfsTreeifyer(tGraph: TGraph): void {
  const visited = new Array<number>(tGraph.getNodes().length).fill(0)
  const eliminated: TEdge[] = []

  // 重编号 (Java init)
  let id = 0
  for (const node of tGraph.getNodes()) {
    node.id = id++
  }

  const treeifyingOrder = tGraph.props[SEARCH_ORDER] as string | undefined
  // start DFS on every node in graph
  for (const tNode of tGraph.getNodes()) {
    // if the node has not been visited yet
    if (visited[tNode.id] === 0) {
      // call DFS or BFS on that node
      if (treeifyingOrder === TreeifyingOrder.BFS) {
        bfs(tNode, visited, eliminated)
      } else {
        dfs(tNode, visited, eliminated)
      }
      // if we come back to that node again, set the node as root
      visited[tNode.id] = 2
    }
  }
  // remove the found edges out of graph structure
  for (const tEdge of eliminated) {
    const si = tEdge.getSource().getOutgoingEdges().indexOf(tEdge)
    if (si !== -1) tEdge.getSource().getOutgoingEdges().splice(si, 1)
    const ti = tEdge.getTarget().getIncomingEdges().indexOf(tEdge)
    if (ti !== -1) tEdge.getTarget().getIncomingEdges().splice(ti, 1)
  }
  // set the list of collected edges as a graph property
  setProp(tGraph, P_REMOVABLE_EDGES, eliminated)
}

function dfs(tNode: TNode, visited: number[], eliminated: TEdge[]): void {
  // dfs starts on a node and marks that node as visited
  visited[tNode.id] = 1
  // go to all child nodes of start node
  for (const tEdge of tNode.getOutgoingEdges()) {
    const target = tEdge.getTarget()
    // if a child has been visited
    if (visited[target.id] === 1) {
      // put that edge to the list that contains the edges to remove
      eliminated.push(tEdge)
    } else if (visited[target.id] === 2) {
      // if a previous root can be visited from another node unmark the root property
      visited[target.id] = 1
    } else {
      // recurse
      dfs(target, visited, eliminated)
    }
  }
}

function bfs(startNode: TNode, visited: number[], eliminated: TEdge[]): void {
  const nodeQueue: TNode[] = [startNode]
  do {
    const node = nodeQueue.shift() as TNode
    visited[node.id] = 1
    for (const tEdge of node.getOutgoingEdges()) {
      const target = tEdge.getTarget()
      // if a child has been visited
      if (visited[target.id] === 1) {
        // put that edge to the list that contains the edges to remove
        eliminated.push(tEdge)
      } else if (visited[target.id] === 2) {
        // if a previous root can be visited from another node unmark the root property
        visited[target.id] = 1
      } else {
        // process the node in breadth-first order
        nodeQueue.push(target)
      }
    }
  } while (nodeQueue.length > 0)
}
