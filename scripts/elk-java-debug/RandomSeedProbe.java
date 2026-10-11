import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.lang.reflect.Field;
import org.eclipse.elk.alg.layered.graph.LGraph;
import org.eclipse.elk.alg.layered.p3order.LayerSweepCrossingMinimizer;
import org.eclipse.elk.core.RecursiveGraphLayoutEngine;
import org.eclipse.elk.core.alg.ILayoutProcessor;
import org.eclipse.elk.core.data.LayoutMetaDataService;
import org.eclipse.elk.core.options.CoreOptions;
import org.eclipse.elk.core.testing.TestController;
import org.eclipse.elk.core.testing.TestController.ILayoutExecutionListener;
import org.eclipse.elk.core.util.BasicProgressMonitor;
import org.eclipse.elk.graph.ElkNode;

/** 反射读取 Java LayerSweepCrossingMinimizer 的 randomSeed + 打印每次 P3 后层内顺序. */
public class RandomSeedProbe {
    public static void main(String[] args) throws Exception {
        LayoutMetaDataService.getInstance().registerLayoutMetaDataProviders();
        String json = new String(Files.readAllBytes(new java.io.File(args[0]).toPath()), StandardCharsets.UTF_8);
        ElkNode root = org.eclipse.elk.graph.json.ElkGraphJson.forGraph(json).toElk();
        root.setProperty(CoreOptions.ALGORITHM, "org.eclipse.elk.layered");
        TestController tc = new TestController("org.eclipse.elk.layered");
        tc.addLayoutExecutionListener(new ILayoutExecutionListener() {
            public void layoutProcessorReady(ILayoutProcessor<?> processor, Object graph, boolean isRoot) {
                if (processor instanceof LayerSweepCrossingMinimizer && graph instanceof LGraph) {
                    LGraph lg = (LGraph) graph;
                    if (lg.getParentNode() == null) {
                        System.out.println("JAVA LayerSweep starting (root graph)");
                        try {
                            Field f = LayerSweepCrossingMinimizer.class.getDeclaredField("crossMinType");
                            f.setAccessible(true);
                            System.out.println("JAVA crossMinType: " + f.get(processor));
                        } catch (Exception e) { System.out.println("JAVA reflect crossMinType err: " + e); }
                    }
                }
            }
            public void layoutProcessorFinished(ILayoutProcessor<?> processor, Object graph, boolean isRoot) {
                if (processor instanceof LayerSweepCrossingMinimizer && graph instanceof LGraph) {
                    LGraph lg = (LGraph) graph;
                    if (lg.getParentNode() == null) {
                        try {
                            Field f = LayerSweepCrossingMinimizer.class.getDeclaredField("randomSeed");
                            f.setAccessible(true);
                            System.out.println("JAVA LayerSweep randomSeed: " + f.getLong(processor));
                        } catch (Exception e) { System.out.println("JAVA reflect err: " + e); }
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
