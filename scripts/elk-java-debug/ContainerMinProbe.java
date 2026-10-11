import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import org.eclipse.elk.alg.common.nodespacing.NodeLabelAndSizeCalculator;
import org.eclipse.elk.alg.common.nodespacing.internal.NodeContext;
import org.eclipse.elk.alg.layered.graph.LGraph;
import org.eclipse.elk.alg.layered.graph.LGraphAdapters;
import org.eclipse.elk.alg.layered.graph.LNode;
import org.eclipse.elk.alg.layered.graph.LNode.NodeType;
import org.eclipse.elk.core.RecursiveGraphLayoutEngine;
import org.eclipse.elk.core.alg.ILayoutProcessor;
import org.eclipse.elk.core.data.LayoutMetaDataService;
import org.eclipse.elk.core.options.CoreOptions;
import org.eclipse.elk.alg.layered.options.LayeredOptions;
import org.eclipse.elk.core.options.PortSide;
import org.eclipse.elk.core.options.SizeConstraint;
import org.eclipse.elk.core.testing.TestController;
import org.eclipse.elk.core.testing.TestController.ILayoutExecutionListener;
import org.eclipse.elk.core.util.BasicProgressMonitor;
import org.eclipse.elk.core.util.adapters.GraphAdapters.GraphAdapter;
import org.eclipse.elk.core.util.adapters.GraphAdapters.NodeAdapter;
import org.eclipse.elk.graph.ElkNode;

/** 打印每个 compound 节点的 cell min (applyStuff=false) + nested minimum. */
public class ContainerMinProbe {
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
        GraphAdapter<LGraph> adapter = LGraphAdapters.adapt(g, true, true, node -> node.getType() == NodeType.NORMAL);
        for (NodeAdapter<?> na : adapter.getNodes()) {
            if (na.getProperty(LayeredOptions.NODE_SIZE_CONSTRAINTS) == null) continue;
            String lbl = na.getLabels().iterator().next().getText();
            if (!lbl.contains("Cont4") && !lbl.contains("Cont3") && !lbl.contains("Cont2")) continue;
            org.eclipse.elk.core.math.KVector cellMin = NodeLabelAndSizeCalculator.process(adapter, na, false, false);
            System.out.printf("node %s size=%.0fx%.0f cellMin=%.0fx%.0f constraints=%s%n", lbl, na.getSize().x, na.getSize().y, cellMin.x, cellMin.y, na.getProperty(LayeredOptions.NODE_SIZE_CONSTRAINTS));
        }
        if (g.getParentNode() != null) {
            LNode parent = g.getParentNode();
            String lbl = parent.getDesignation();
            if (lbl.contains("Cont4") || lbl.contains("Cont3") || lbl.contains("Cont2")) {
                org.eclipse.elk.core.math.KVector min = parent.getProperty(LayeredOptions.NODE_SIZE_MINIMUM);
                System.out.printf("nested %s size=%.0fx%.0f minimum=%s%n", lbl, g.getSize().x, g.getSize().y, min);
            }
        }
    }
}
