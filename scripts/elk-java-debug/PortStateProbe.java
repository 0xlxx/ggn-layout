import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.lang.reflect.Field;
import org.eclipse.elk.alg.layered.graph.LGraph;
import org.eclipse.elk.alg.layered.graph.LNode;
import org.eclipse.elk.alg.layered.graph.LPort;
import org.eclipse.elk.alg.layered.graph.Layer;
import org.eclipse.elk.alg.layered.p3order.LayerSweepCrossingMinimizer;
import org.eclipse.elk.alg.layered.p5edges.OrthogonalEdgeRouter;
import org.eclipse.elk.core.RecursiveGraphLayoutEngine;
import org.eclipse.elk.core.alg.ILayoutProcessor;
import org.eclipse.elk.core.data.LayoutMetaDataService;
import org.eclipse.elk.core.options.CoreOptions;
import org.eclipse.elk.core.testing.TestController;
import org.eclipse.elk.core.testing.TestController.ILayoutExecutionListener;
import org.eclipse.elk.core.util.BasicProgressMonitor;
import org.eclipse.elk.graph.ElkNode;

/** 打印 OrthogonalEdgeRouter 前后 n1/box 的 x + 端口数. */
public class PortStateProbe {
    static void dump(String tag, LGraph lg) {
        for (Layer layer : lg.getLayers()) {
            for (LNode n : layer.getNodes()) {
                int in = 0, out = 0;
                for (LPort p : n.getPorts()) { if (!p.getIncomingEdges().isEmpty()) in++; if (!p.getOutgoingEdges().isEmpty()) out++; }
                System.out.println("JAVA " + tag + " " + n.getDesignation() + " x=" + n.getPosition().x + " ports=" + n.getPorts().size() + " in=" + in + " out=" + out + " layerW=" + layer.getSize().x);
            }
        }
    }
    public static void main(String[] args) throws Exception {
        LayoutMetaDataService.getInstance().registerLayoutMetaDataProviders();
        String json = new String(Files.readAllBytes(new java.io.File(args[0]).toPath()), StandardCharsets.UTF_8);
        ElkNode root = org.eclipse.elk.graph.json.ElkGraphJson.forGraph(json).toElk();
        root.setProperty(CoreOptions.ALGORITHM, "org.eclipse.elk.layered");
        TestController tc = new TestController("org.eclipse.elk.layered");
        tc.addLayoutExecutionListener(new ILayoutExecutionListener() {
            public void layoutProcessorReady(ILayoutProcessor<?> processor, Object graph, boolean isRoot) {
                if (processor instanceof OrthogonalEdgeRouter && graph instanceof LGraph) {
                    LGraph lg = (LGraph) graph;
                    if (lg.getParentNode() == null) dump("beforeP5", lg);
                }
            }
            public void layoutProcessorFinished(ILayoutProcessor<?> processor, Object graph, boolean isRoot) {
                if (processor instanceof OrthogonalEdgeRouter && graph instanceof LGraph) {
                    LGraph lg = (LGraph) graph;
                    if (lg.getParentNode() == null) dump("afterP5", lg);
                }
            }
        });
        BasicProgressMonitor m = new BasicProgressMonitor();
        m.begin("root", 1);
        new RecursiveGraphLayoutEngine().layout(root, tc, m);
        m.done();
    }
}
