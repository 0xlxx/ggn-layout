import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import org.eclipse.elk.alg.layered.graph.LGraph;
import org.eclipse.elk.alg.layered.graph.LNode;
import org.eclipse.elk.alg.layered.graph.LPort;
import org.eclipse.elk.alg.layered.graph.LLabel;
import org.eclipse.elk.alg.layered.graph.LEdge;
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

/** 在 LabelAndNodeSize 后 dump 所有 EXTERNAL_PORT dummy 的端口标签 (尺寸/位置). */
public class DummyLabelProbe {
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
        String parent = g.getParentNode() != null ? g.getParentNode().getDesignation() : "ROOT";
        for (Layer layer : g.getLayers()) {
            for (LNode node : layer.getNodes()) {
                if (node.getNestedGraph() != null) dump(node.getNestedGraph());
                if (node.getType() != NodeType.EXTERNAL_PORT) continue;
                StringBuilder sb = new StringBuilder();
                for (LPort port : node.getPorts()) {
                    sb.append(String.format(" port[%s@%.0f,%.0f size=%.0fx%.0f", port.getSide(), port.getPosition().x, port.getPosition().y, port.getSize().x, port.getSize().y));
                    int li = 0;
                    for (LLabel l : port.getLabels()) {
                        Object origin = l.getProperty(org.eclipse.elk.alg.layered.options.InternalProperties.ORIGIN);
                        String ot = origin instanceof org.eclipse.elk.graph.ElkLabel ? ((org.eclipse.elk.graph.ElkLabel) origin).getText() : "?";
                        sb.append(String.format(" lbl%d=text[%s]orig[%s]@%.1f,%.1f %.1fx%.1f", li++, l.getText(), ot, l.getPosition().x, l.getPosition().y, l.getSize().x, l.getSize().y));
                    }
                    sb.append("]");
                }
                StringBuilder conn = new StringBuilder();
                for (LPort port : node.getPorts()) {
                    for (LEdge e : port.getIncomingEdges()) conn.append(" in=" + e.getSource().getNode().getDesignation());
                    for (LEdge e : port.getOutgoingEdges()) conn.append(" out=" + e.getTarget().getNode().getDesignation());
                }
                System.out.printf("dummy %s side=%s plp=%s size=%.0fx%.0f margin=(%.0f,%.0f,%.0f,%.0f) %s%s%n", node.getDesignation(), node.getProperty(org.eclipse.elk.alg.layered.options.InternalProperties.EXT_PORT_SIDE), node.getProperty(org.eclipse.elk.core.options.CoreOptions.PORT_LABELS_PLACEMENT), node.getSize().x, node.getSize().y, node.getMargin().left, node.getMargin().top, node.getMargin().right, node.getMargin().bottom, sb.toString(), conn.toString());
            }
        }
    }
}
