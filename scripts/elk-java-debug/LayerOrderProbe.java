import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.lang.reflect.Field;
import org.eclipse.elk.alg.layered.graph.LGraph;
import org.eclipse.elk.alg.layered.graph.LNode;
import org.eclipse.elk.alg.layered.graph.Layer;
import org.eclipse.elk.alg.layered.p3order.LayerSweepCrossingMinimizer;
import org.eclipse.elk.core.RecursiveGraphLayoutEngine;
import org.eclipse.elk.core.alg.ILayoutProcessor;
import org.eclipse.elk.core.data.LayoutMetaDataService;
import org.eclipse.elk.core.options.CoreOptions;
import org.eclipse.elk.core.testing.TestController;
import org.eclipse.elk.core.testing.TestController.ILayoutExecutionListener;
import org.eclipse.elk.core.util.BasicProgressMonitor;
import org.eclipse.elk.graph.ElkNode;

/** 打印每遍 LayerSweepCrossingMinimizer 后 root 图各层节点顺序. */
public class LayerOrderProbe {
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
                    String parent = lg.getParentNode() == null ? "ROOT" : ("parent=" + lg.getParentNode().getDesignation());
                    System.out.println("JAVA after LayerSweep graph=" + parent + " layerless=" + lg.getLayerlessNodes().size());
                    StringBuilder all = new StringBuilder("  ALL nodes: ");
                    for (LNode n : lg.getLayerlessNodes()) all.append(n.getDesignation()).append("(layerless) ");
                    for (Layer layer : lg.getLayers()) for (LNode n : layer.getNodes()) all.append(n.getDesignation()).append(" ");
                    System.out.println(all);
                    try {
                        Field f = LayerSweepCrossingMinimizer.class.getDeclaredField("crossMinType");
                        f.setAccessible(true);
                        System.out.println("  type=" + f.get(processor));
                    } catch (Exception e) { System.out.println("  reflect err: " + e); }
                    for (Layer layer : lg.getLayers()) {
                        StringBuilder sb = new StringBuilder("  layer").append(layer.getIndex()).append(": ");
                        for (LNode n : layer.getNodes()) sb.append(n.getDesignation()).append(" ");
                        System.out.println(sb);
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
