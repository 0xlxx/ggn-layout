import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import org.eclipse.elk.alg.layered.graph.LGraph;
import org.eclipse.elk.alg.layered.graph.LNode;
import org.eclipse.elk.alg.layered.graph.Layer;
import org.eclipse.elk.core.RecursiveGraphLayoutEngine;
import org.eclipse.elk.core.alg.ILayoutProcessor;
import org.eclipse.elk.core.data.LayoutMetaDataService;
import org.eclipse.elk.core.options.CoreOptions;
import org.eclipse.elk.core.testing.TestController;
import org.eclipse.elk.core.testing.TestController.ILayoutExecutionListener;
import org.eclipse.elk.core.util.BasicProgressMonitor;
import org.eclipse.elk.graph.ElkNode;

/** 在 BK (P4) 之后 dump 嵌套图各层节点位置. */
public class LayerDumpProbe {
    public static void main(String[] args) throws Exception {
        LayoutMetaDataService.getInstance().registerLayoutMetaDataProviders();
        String json = new String(Files.readAllBytes(new java.io.File(args[0]).toPath()), StandardCharsets.UTF_8);
        ElkNode root = org.eclipse.elk.graph.json.ElkGraphJson.forGraph(json).toElk();
        root.setProperty(CoreOptions.ALGORITHM, "org.eclipse.elk.layered");
        TestController tc = new TestController("org.eclipse.elk.layered");
        tc.addLayoutExecutionListener(new ILayoutExecutionListener() {
            public void layoutProcessorReady(ILayoutProcessor<?> processor, Object graph, boolean isRoot) {}
            public void layoutProcessorFinished(ILayoutProcessor<?> processor, Object graph, boolean isRoot) {
                if (graph instanceof LGraph) {
                    dump((LGraph) graph);
                }
            }
        });
        BasicProgressMonitor m = new BasicProgressMonitor();
        m.begin("root", 1);
        new RecursiveGraphLayoutEngine().layout(root, tc, m);
        m.done();
    }
    static boolean seen = false;
    static void dump(LGraph g) {
        if (g.getParentNode() == null && !seen) return;
        String pn = g.getParentNode().getDesignation();
        if (g.getParentNode() == null && !seen) return;
        seen = true;
        System.out.println("=== layers of " + (g.getParentNode() != null ? g.getParentNode().getDesignation() : "ROOT"));
        for (Layer layer : g.getLayers()) {
            StringBuilder sb = new StringBuilder();
            for (LNode n : layer.getNodes()) {
                String lbl = n.getDesignation();
                sb.append(String.format(" %s@%.1f,%.1f[%.0fx%.0f]m=(%.0f,%.0f,%.0f,%.0f)", lbl, n.getPosition().x, n.getPosition().y, n.getSize().x, n.getSize().y, n.getMargin().left, n.getMargin().top, n.getMargin().right, n.getMargin().bottom));
            }
            System.out.println("L" + layer.getIndex() + ":" + sb.toString());
        }
    }
}
