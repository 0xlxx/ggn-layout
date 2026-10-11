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

/** 边路由 oracle 生成器: 输出每条边的源/目标节点 id + start/end/bendPoints (世界坐标). */
public class EdgeOracleMain {
    public static void main(String[] args) throws Exception {
        LayoutMetaDataService.getInstance().registerLayoutMetaDataProviders();
        for (String a : args) {
            try {
                String json = new String(Files.readAllBytes(new File(a).toPath()), StandardCharsets.UTF_8);
                ElkNode root = org.eclipse.elk.graph.json.ElkGraphJson.forGraph(json).toElk();
                root.setProperty(CoreOptions.ALGORITHM, "org.eclipse.elk.layered");
                new RecursiveGraphLayoutEngine().layout(root, new BasicProgressMonitor());
                System.out.println("FILE " + new File(a).getName());
                for (ElkEdge e : allEdges(root)) dumpEdge(e);
                System.out.println("END " + a);
            } catch (Throwable t) {
                System.err.println("ERR " + a + ": " + t.getClass().getName() + " " + t.getMessage());
            }
        }
    }
    static java.util.List<ElkEdge> allEdges(ElkNode n) {
        java.util.List<ElkEdge> out = new java.util.ArrayList<>();
        for (Object eo : n.getContainedEdges()) out.add((ElkEdge) eo);
        for (ElkNode c : n.getChildren()) out.addAll(allEdges(c));
        return out;
    }
    static String nodeId(ElkConnectableShape s) {
        if (s instanceof ElkPort) return ((ElkPort) s).getParent().getIdentifier();
        if (s instanceof ElkNode) return ((ElkNode) s).getIdentifier();
        return "?";
    }
    static void dumpEdge(ElkEdge e) {
        List<ElkConnectableShape> srcs = e.getSources(), tgts = e.getTargets();
        String src = srcs.isEmpty() ? "?" : nodeId(srcs.get(0));
        String tgt = tgts.isEmpty() ? "?" : nodeId(tgts.get(0));
        StringBuilder sb = new StringBuilder();
        for (ElkEdgeSection s : e.getSections()) {
            sb.append(" start=(" + s.getStartX() + "," + s.getStartY() + ")");
            for (Object b : s.getBendPoints()) {
                org.eclipse.elk.graph.ElkBendPoint bp = (org.eclipse.elk.graph.ElkBendPoint) b;
                sb.append(" bp=(" + bp.getX() + "," + bp.getY() + ")");
            }
            sb.append(" end=(" + s.getEndX() + "," + s.getEndY() + ")");
        }
        System.out.println("EDGE " + src + "->" + tgt + sb);
    }
}
