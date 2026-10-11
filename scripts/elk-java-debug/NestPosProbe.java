import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import org.eclipse.elk.alg.layered.graph.LGraph;
import org.eclipse.elk.alg.layered.graph.LNode;
import org.eclipse.elk.alg.layered.graph.LEdge;
import org.eclipse.elk.alg.layered.graph.LPort;
import org.eclipse.elk.core.RecursiveGraphLayoutEngine;
import org.eclipse.elk.core.alg.ILayoutProcessor;
import org.eclipse.elk.core.data.LayoutMetaDataService;
import org.eclipse.elk.core.options.CoreOptions;
import org.eclipse.elk.core.testing.TestController;
import org.eclipse.elk.core.testing.TestController.ILayoutExecutionListener;
import org.eclipse.elk.core.util.BasicProgressMonitor;
import org.eclipse.elk.graph.ElkNode;

/** 打印 o 嵌套图 (parent designation 含 No) 布局后节点. */
public class NestPosProbe {
    public static void main(String[] args) throws Exception {
        LayoutMetaDataService.getInstance().registerLayoutMetaDataProviders();
        String json = new String(Files.readAllBytes(new java.io.File(args[0]).toPath()), StandardCharsets.UTF_8);
        ElkNode root = org.eclipse.elk.graph.json.ElkGraphJson.forGraph(json).toElk();
        root.setProperty(CoreOptions.ALGORITHM, "org.eclipse.elk.layered");
        TestController tc = new TestController("org.eclipse.elk.layered");
        tc.addLayoutExecutionListener(new ILayoutExecutionListener() {
            public void layoutProcessorReady(ILayoutProcessor<?> processor, Object graph, boolean isRoot) {}
            public void layoutProcessorFinished(ILayoutProcessor<?> processor, Object graph, boolean isRoot) {
                if (!(graph instanceof LGraph)) return;
                LGraph g = (LGraph) graph;
                String parent = g.getParentNode() != null ? g.getParentNode().getDesignation() : null;
                if (parent == null || !parent.contains("No")) return;
                String mod = processor.getClass().getSimpleName();
                if (!mod.contains("OrthogonalEdgeRouter") && !mod.contains("ReversedEdgeRestorer")) return;
                StringBuilder sb = new StringBuilder("[" + mod + "] offset=" + g.getOffset());
                for (var layer : g.getLayers()) for (LNode n : layer.getNodes()) {
                    sb.append(" | L" + layer.getIndex() + " " + n.getDesignation() + "[" + n.getType() + "] pos=(" + n.getPosition().x + "," + n.getPosition().y + ") size=(" + n.getSize().x + "," + n.getSize().y + ")");
                    for (LPort p : n.getPorts()) for (LEdge e : p.getOutgoingEdges()) {
                        sb.append(" e" + p.getSide() + "->" + e.getTarget().getSide() + "b" + e.getBendPoints());
                    }
                }
                System.out.println(sb);
            }
        });
        BasicProgressMonitor m = new BasicProgressMonitor();
        m.begin("root", 1);
        new RecursiveGraphLayoutEngine().layout(root, tc, m);
        m.done();
    }
}
