import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import org.eclipse.elk.alg.layered.graph.*;
import org.eclipse.elk.alg.layered.graph.LNode.NodeType;
import org.eclipse.elk.core.RecursiveGraphLayoutEngine;
import org.eclipse.elk.core.alg.ILayoutProcessor;
import org.eclipse.elk.core.data.LayoutMetaDataService;
import org.eclipse.elk.core.options.CoreOptions;
import org.eclipse.elk.core.testing.TestController;
import org.eclipse.elk.core.testing.TestController.ILayoutExecutionListener;
import org.eclipse.elk.core.util.BasicProgressMonitor;
import org.eclipse.elk.graph.ElkNode;

/** 全布局后 dump N1 嵌套图 (dummy 位置/尺寸 + 图尺寸/padding/offset). */
public class Nested298Probe {
    static LGraph lastNested = null;
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
                    LGraph g = (LGraph) graph;
                    if (g.getParentNode() != null) {
                        lastNested = g;
                        System.out.println("[finish] proc=" + processor.getClass().getSimpleName() + " nested parent=" + g.getParentNode().getDesignation());
                    }
                }
            }
        });
        BasicProgressMonitor m = new BasicProgressMonitor();
        m.begin("root", 1);
        new RecursiveGraphLayoutEngine().layout(root, tc, m);
        m.done();
        if (lastNested != null) {
            System.out.println("nested size=" + lastNested.getSize() + " pad=" + lastNested.getPadding() + " offset=" + lastNested.getOffset() + " parent=" + lastNested.getParentNode().getDesignation());
            for (LNode n : lastNested.getLayerlessNodes()) dump(n);
            for (Layer l : lastNested.getLayers()) for (LNode n : l.getNodes()) dump(n);
        }
    }
    static void dump(LNode n) {
        StringBuilder sb = new StringBuilder();
        for (LPort p : n.getPorts()) sb.append(String.format(" %s@(%.1f,%.1f)", p.getSide(), p.getPosition().x, p.getPosition().y));
        System.out.printf("  %s type=%s pos=(%.1f,%.1f) size=%.0fx%.0f ports=[%s]%n", n.getDesignation(), n.getType(), n.getPosition().x, n.getPosition().y, n.getSize().x, n.getSize().y, sb.toString());
    }
}
