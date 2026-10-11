import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import org.eclipse.elk.alg.layered.graph.LGraph;
import org.eclipse.elk.alg.layered.graph.LNode;
import org.eclipse.elk.alg.layered.graph.LNode.NodeType;
import org.eclipse.elk.core.RecursiveGraphLayoutEngine;
import org.eclipse.elk.core.alg.ILayoutProcessor;
import org.eclipse.elk.core.data.LayoutMetaDataService;
import org.eclipse.elk.core.options.CoreOptions;
import org.eclipse.elk.core.testing.TestController;
import org.eclipse.elk.core.testing.TestController.ILayoutExecutionListener;
import org.eclipse.elk.core.util.BasicProgressMonitor;
import org.eclipse.elk.graph.ElkNode;

public class InstrTrace {
    static String lastParent = "";
    public static void main(String[] args) throws Exception {
        LayoutMetaDataService.getInstance().registerLayoutMetaDataProviders();
        String json = new String(Files.readAllBytes(new java.io.File(args[0]).toPath()), StandardCharsets.UTF_8);
        ElkNode root = org.eclipse.elk.graph.json.ElkGraphJson.forGraph(json).toElk();
        root.setProperty(CoreOptions.ALGORITHM, "org.eclipse.elk.layered");
        TestController tc = new TestController("org.eclipse.elk.layered");
        tc.addLayoutExecutionListener(new ILayoutExecutionListener() {
            public void layoutProcessorReady(ILayoutProcessor<?> processor, Object graph, boolean isRoot) {
                if (graph instanceof LGraph) dump("B", (LGraph) graph, processor);
            }
            public void layoutProcessorFinished(ILayoutProcessor<?> processor, Object graph, boolean isRoot) {
                if (graph instanceof LGraph) dump("A", (LGraph) graph, processor);
            }
        });
        BasicProgressMonitor m = new BasicProgressMonitor();
        m.begin("root", 1);
        new RecursiveGraphLayoutEngine().layout(root, tc, m);
        m.done();
    }
    static void dump(String when, LGraph g, ILayoutProcessor<?> proc) {
        String parent = g.getParentNode() != null ? g.getParentNode().getDesignation() : "ROOT";
        for (LNode n : g.getLayerlessNodes()) {
            if (n.getNestedGraph() != null) dumpNested(n, when, proc);
        }
        for (var layer : g.getLayers()) {
            for (LNode n : layer.getNodes()) {
                if (n.getNestedGraph() != null) dumpNested(n, when, proc);
            }
        }
        System.out.println("TRACE " + when + " " + proc.getClass().getSimpleName() + " parent=[" + parent + "] layers=" + g.getLayers().size() + " nodes=" + g.getLayerlessNodes().size());
        if (!parent.contains("N1")) return; // 只看 N1 子图
        if (g.getLayers().isEmpty() && g.getLayerlessNodes().isEmpty()) return;
        StringBuilder sb = new StringBuilder();
        for (LNode n : g.getLayerlessNodes()) dumpNode(g, n, sb);
        for (var layer : g.getLayers()) for (LNode n : layer.getNodes()) dumpNode(g, n, sb);
        String name = proc.getClass().getSimpleName();
        System.out.println("[" + when + "] " + name + " -> " + sb.toString().trim());
    }
    static void dumpNested(LNode n, String when, ILayoutProcessor<?> proc) {
        LGraph ng = n.getNestedGraph();
        StringBuilder sb = new StringBuilder(" pad=(" + ng.getPadding().top + "," + ng.getPadding().left + ") offset=(" + ng.getOffset().x + "," + ng.getOffset().y + ") size=(" + ng.getSize().x + "," + ng.getSize().y + ")");
        for (var l : ng.getLayers()) {
            sb.append(" L" + l.getIndex() + ":");
            for (LNode nn : l.getNodes()) sb.append(nn.getDesignation() + "@" + nn.getPosition().y + ";");
        }
        System.out.println("[" + when + "] " + proc.getClass().getSimpleName() + " nested(" + n.getDesignation() + ")" + sb.toString());
    }
    static void dumpNode(LGraph g, LNode n, StringBuilder sb) {
        if (n.getType() == NodeType.EXTERNAL_PORT) {
            sb.append(" EP(" + n.getDesignation() + " pos=(" + n.getPosition().x + "," + n.getPosition().y + ") size=(" + n.getSize().x + "," + n.getSize().y + "))");
        } else if (n.getDesignation().contains("N2")) {
            sb.append(" N2(" + n.getDesignation() + " pos=(" + n.getPosition().x + "," + n.getPosition().y + "))");
        }
    }
}
