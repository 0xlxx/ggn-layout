import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import org.eclipse.elk.alg.layered.graph.LGraph;
import org.eclipse.elk.alg.layered.graph.LNode;
import org.eclipse.elk.core.RecursiveGraphLayoutEngine;
import org.eclipse.elk.core.alg.ILayoutProcessor;
import org.eclipse.elk.core.data.LayoutMetaDataService;
import org.eclipse.elk.core.options.CoreOptions;
import org.eclipse.elk.core.testing.TestController;
import org.eclipse.elk.core.testing.TestController.ILayoutExecutionListener;
import org.eclipse.elk.core.util.BasicProgressMonitor;
import org.eclipse.elk.graph.ElkNode;

public class InstrPadMain {
    public static void main(String[] args) throws Exception {
        LayoutMetaDataService.getInstance().registerLayoutMetaDataProviders();
        String json = new String(Files.readAllBytes(new java.io.File(args[0]).toPath()), StandardCharsets.UTF_8);
        ElkNode root = org.eclipse.elk.graph.json.ElkGraphJson.forGraph(json).toElk();
        root.setProperty(CoreOptions.ALGORITHM, "org.eclipse.elk.layered");
        TestController tc = new TestController("org.eclipse.elk.layered");
        tc.addLayoutExecutionListener(new ILayoutExecutionListener() {
            public void layoutProcessorReady(ILayoutProcessor<?> processor, Object graph, boolean isRoot) {
                if (graph instanceof LGraph) dump((LGraph) graph, processor.getClass().getSimpleName(), "BEFORE");
            }
            public void layoutProcessorFinished(ILayoutProcessor<?> processor, Object graph, boolean isRoot) {
                if (graph instanceof LGraph) dump((LGraph) graph, processor.getClass().getSimpleName(), "AFTER");
            }
        });
        BasicProgressMonitor m = new BasicProgressMonitor();
        m.begin("root", 1);
        new RecursiveGraphLayoutEngine().layout(root, tc, m);
        m.done();
    }
    static void dump(LGraph g, String proc, String when) {
        LNode parent = g.getParentNode();
        if (parent == null || !String.valueOf(parent.getDesignation()).contains("N1")) return;
        StringBuilder sb = new StringBuilder();
        sb.append("pad=(" + g.getPadding().top + "," + g.getPadding().left + "," + g.getPadding().bottom + "," + g.getPadding().right + ")");
        sb.append(" offset=(" + g.getOffset().x + "," + g.getOffset().y + ")");
        sb.append(" size=(" + g.getSize().x + "," + g.getSize().y + ")");
        for (var layer : g.getLayers()) for (LNode n : layer.getNodes()) {
            if (n.getDesignation().contains("N2")) sb.append(" N2=(" + n.getPosition().x + "," + n.getPosition().y + ")");
        }
        System.out.println("[" + when + "] " + proc + " " + sb.toString());
    }
}
