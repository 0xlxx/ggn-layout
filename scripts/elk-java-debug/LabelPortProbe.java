import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import org.eclipse.elk.alg.layered.graph.LGraph;
import org.eclipse.elk.alg.layered.graph.LNode;
import org.eclipse.elk.alg.layered.graph.LPort;
import org.eclipse.elk.alg.layered.graph.Layer;
import org.eclipse.elk.core.RecursiveGraphLayoutEngine;
import org.eclipse.elk.core.alg.ILayoutProcessor;
import org.eclipse.elk.core.data.LayoutMetaDataService;
import org.eclipse.elk.core.options.CoreOptions;
import org.eclipse.elk.core.testing.TestController;
import org.eclipse.elk.core.testing.TestController.ILayoutExecutionListener;
import org.eclipse.elk.core.util.BasicProgressMonitor;
import org.eclipse.elk.graph.ElkNode;

/** 在 LabelAndNodeSize 之后立即 dump 每节点端口位置. */
public class LabelPortProbe {
    public static void main(String[] args) throws Exception {
        LayoutMetaDataService.getInstance().registerLayoutMetaDataProviders();
        String json = new String(Files.readAllBytes(new java.io.File(args[0]).toPath()), StandardCharsets.UTF_8);
        ElkNode root = org.eclipse.elk.graph.json.ElkGraphJson.forGraph(json).toElk();
        root.setProperty(CoreOptions.ALGORITHM, "org.eclipse.elk.layered");
        TestController tc = new TestController("org.eclipse.elk.layered");
        tc.addLayoutExecutionListener(new ILayoutExecutionListener() {
            public void layoutProcessorReady(ILayoutProcessor<?> processor, Object graph, boolean isRoot) {}
            public void layoutProcessorFinished(ILayoutProcessor<?> processor, Object graph, boolean isRoot) {
                if (graph instanceof LGraph && processor.getClass().getSimpleName().contains("LabelAndNodeSize")) {
                    System.out.println("=== after LabelAndNodeSize");
                    dump((LGraph) graph);
                }
            }
        });
        BasicProgressMonitor m = new BasicProgressMonitor();
        m.begin("root", 1);
        new RecursiveGraphLayoutEngine().layout(root, tc, m);
        m.done();
    }
    static void dump(LGraph g) {
        for (Layer layer : g.getLayers()) {
            for (LNode node : layer.getNodes()) {
                System.out.println("  NODE " + node.getDesignation() + " portLabelsPlacement=" + node.getProperty(org.eclipse.elk.core.options.CoreOptions.PORT_LABELS_PLACEMENT) + " portConstraints=" + node.getProperty(org.eclipse.elk.core.options.CoreOptions.PORT_CONSTRAINTS));
                if (node.getNestedGraph() != null) dump(node.getNestedGraph());
                StringBuilder sb = new StringBuilder();
                for (LPort port : node.getPorts()) {
                    sb.append(String.format(" %s@%.1f,%.1f(%.0fx%.0f)", port.getSide(), port.getPosition().x, port.getPosition().y, port.getSize().x, port.getSize().y));
                    for (org.eclipse.elk.alg.layered.graph.LLabel l : port.getLabels()) {
                        sb.append(String.format(" lbl=[%s@%.1f,%.1f %.0fx%.0f]", l.getText(), l.getPosition().x, l.getPosition().y, l.getSize().x, l.getSize().y));
                    }
                }
                System.out.printf("  %s size=%.0fx%.0f ports=[%s]%n", node.getDesignation(), node.getSize().x, node.getSize().y, sb.toString());
            }
        }
    }
}
