import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import org.eclipse.elk.alg.layered.graph.LGraph;
import org.eclipse.elk.alg.layered.graph.LNode;
import org.eclipse.elk.alg.layered.graph.Layer;
import org.eclipse.elk.alg.layered.p3order.LayerSweepCrossingMinimizer;
import org.eclipse.elk.core.RecursiveGraphLayoutEngine;
import org.eclipse.elk.core.alg.ILayoutProcessor;
import org.eclipse.elk.core.data.LayoutMetaDataService;
import org.eclipse.elk.core.testing.TestController;
import org.eclipse.elk.core.testing.TestController.ILayoutExecutionListener;
import org.eclipse.elk.core.util.BasicProgressMonitor;
import org.eclipse.elk.core.options.CoreOptions;
import org.eclipse.elk.graph.ElkNode;

/** 打印 root 图 P3 后每层节点顺序 (含 dummy). */
public class LayerOrderProbe2 {
    public static void main(String[] args) throws Exception {
        LayoutMetaDataService.getInstance().registerLayoutMetaDataProviders();
        String json = new String(Files.readAllBytes(new java.io.File(args[0]).toPath()), StandardCharsets.UTF_8);
        ElkNode root = org.eclipse.elk.graph.json.ElkGraphJson.forGraph(json).toElk();
        root.setProperty(CoreOptions.ALGORITHM, "org.eclipse.elk.layered");
        TestController tc = new TestController("org.eclipse.elk.layered");
        tc.addLayoutExecutionListener(new ILayoutExecutionListener() {
            public void layoutProcessorReady(ILayoutProcessor<?> processor, Object graph, boolean isRoot) {}
            public void layoutProcessorFinished(ILayoutProcessor<?> processor, Object graph, boolean isRoot) {
                if (processor instanceof LayerSweepCrossingMinimizer && graph instanceof LGraph) {
                    LGraph lg = (LGraph) graph;
                    if (lg.getParentNode() == null) {
                        for (Layer layer : lg.getLayers()) {
                            StringBuilder sb = new StringBuilder("JAVA layer").append(layer.getIndex()).append(": ");
                            boolean hit = false;
                            for (LNode n : layer.getNodes()) { sb.append(n.getDesignation()).append(","); if (n.getDesignation().contains("NN32") || n.getDesignation().contains("NN30")) hit = true; }
                            if (hit) System.out.println(sb);
                        }
                    }
                }
            }
        });
        BasicProgressMonitor m = new BasicProgressMonitor();
        m.begin("root", 1);
        new RecursiveGraphLayoutEngine().layout(root, tc, m);
        m.done();
    }
}
