import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import org.eclipse.elk.alg.layered.graph.LGraph;
import org.eclipse.elk.alg.layered.graph.LNode;
import org.eclipse.elk.alg.layered.graph.LNode.NodeType;
import org.eclipse.elk.alg.layered.graph.Layer;
import org.eclipse.elk.core.RecursiveGraphLayoutEngine;
import org.eclipse.elk.core.alg.ILayoutProcessor;
import org.eclipse.elk.core.data.LayoutMetaDataService;
import org.eclipse.elk.core.options.CoreOptions;
import org.eclipse.elk.core.testing.TestController;
import org.eclipse.elk.core.testing.TestController.ILayoutExecutionListener;
import org.eclipse.elk.core.util.BasicProgressMonitor;
import org.eclipse.elk.graph.ElkNode;

/** 在 HierarchicalNodeResizing 前 dump NN1 嵌套图. */
public class NestedLGraphProbe {
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
    static boolean seenN1 = false;
    static void dump(LGraph g) {
        if (g.getParentNode() == null || !g.getParentNode().getDesignation().contains("N1")) return;
        if (seenN1) return;
        seenN1 = true;
        System.out.println("NN1 nested size=" + g.getSize() + " actual=" + g.getActualSize() + " pad=" + g.getPadding() + " offset=" + g.getOffset() + " minimum=" + g.getProperty(org.eclipse.elk.alg.layered.options.LayeredOptions.NODE_SIZE_MINIMUM));
        for (Layer layer : g.getLayers()) {
            for (LNode n : layer.getNodes()) {
                System.out.printf("  L%d %s@%.1f,%.1f[%.0fx%.0f]%n", layer.getIndex(), n.getDesignation(), n.getPosition().x, n.getPosition().y, n.getSize().x, n.getSize().y);
            }
        }
    }
}
