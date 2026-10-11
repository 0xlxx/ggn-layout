import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.List;
import org.eclipse.elk.core.RecursiveGraphLayoutEngine;
import org.eclipse.elk.core.data.LayoutMetaDataService;
import org.eclipse.elk.core.options.CoreOptions;
import org.eclipse.elk.core.util.BasicProgressMonitor;
import org.eclipse.elk.graph.ElkNode;
import org.eclipse.elk.graph.ElkEdge;
import org.eclipse.elk.graph.ElkEdgeSection;
import org.eclipse.elk.graph.ElkConnectableShape;
import org.eclipse.elk.graph.ElkPort;

/** vis 视觉对比 jar 侧: 输出节点 (缩进=层级深度) + 边 (start/bendPoints/end, 世界坐标). */
public class EdgeMain {
    public static void main(String[] args) throws Exception {
        LayoutMetaDataService.getInstance().registerLayoutMetaDataProviders();
        for (String a : args) {
            try {
                String json = new String(Files.readAllBytes(new File(a).toPath()), StandardCharsets.UTF_8);
                ElkNode root = org.eclipse.elk.graph.json.ElkGraphJson.forGraph(json).toElk();
                root.setProperty(CoreOptions.ALGORITHM, "org.eclipse.elk.layered");
                new RecursiveGraphLayoutEngine().layout(root, new BasicProgressMonitor());
                System.out.println("FILE " + new File(a).getName());
                dumpNode(root, 0);
                for (ElkEdge e : allEdges(root)) dumpEdge(e);
            } catch (Throwable t) {
                System.err.println("ERR " + a + ": " + t.getClass().getName() + " " + t.getMessage());
            }
        }
    }
    static void dumpNode(ElkNode n, int depth) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < depth; i++) sb.append("  ");
        sb.append("NODE ").append(n.getIdentifier())
          .append(" x=").append(n.getX()).append(" y=").append(n.getY())
          .append(" w=").append(n.getWidth()).append(" h=").append(n.getHeight());
        System.out.println(sb);
        for (ElkNode c : n.getChildren()) dumpNode(c, depth + 1);
    }
    static List<ElkEdge> allEdges(ElkNode n) {
        List<ElkEdge> out = new java.util.ArrayList<>();
        for (Object eo : n.getContainedEdges()) out.add((ElkEdge) eo);
        for (ElkNode c : n.getChildren()) out.addAll(allEdges(c));
        return out;
    }
    static void dumpEdge(ElkEdge e) {
        List<ElkConnectableShape> srcs = e.getSources(), tgts = e.getTargets();
        String src = srcs.isEmpty() ? "?" : nodeId(srcs.get(0));
        String tgt = tgts.isEmpty() ? "?" : nodeId(tgts.get(0));
        StringBuilder sb = new StringBuilder("EDGE ").append(src).append("->").append(tgt);
        for (ElkEdgeSection s : e.getSections()) {
            sb.append(" start=(").append(s.getStartX()).append(",").append(s.getStartY()).append(")");
            for (Object b : s.getBendPoints()) {
                org.eclipse.elk.graph.ElkBendPoint bp = (org.eclipse.elk.graph.ElkBendPoint) b;
                sb.append(" bp=(").append(bp.getX()).append(",").append(bp.getY()).append(")");
            }
            sb.append(" end=(").append(s.getEndX()).append(",").append(s.getEndY()).append(")");
        }
        System.out.println(sb);
    }
    static String nodeId(ElkConnectableShape s) {
        if (s instanceof ElkPort) return ((ElkPort) s).getParent().getIdentifier();
        if (s instanceof ElkNode) return ((ElkNode) s).getIdentifier();
        return "?";
    }
}
