import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import com.google.common.collect.Multimap;
import org.eclipse.elk.alg.layered.graph.LGraph;
import org.eclipse.elk.alg.layered.graph.LNode;
import org.eclipse.elk.alg.layered.graph.LEdge;
import org.eclipse.elk.alg.layered.graph.LPort;
import org.eclipse.elk.alg.layered.compound.CrossHierarchyEdge;
import org.eclipse.elk.alg.layered.options.InternalProperties;
import org.eclipse.elk.core.RecursiveGraphLayoutEngine;
import org.eclipse.elk.core.alg.ILayoutProcessor;
import org.eclipse.elk.core.data.LayoutMetaDataService;
import org.eclipse.elk.core.options.CoreOptions;
import org.eclipse.elk.core.testing.TestController;
import org.eclipse.elk.core.testing.TestController.ILayoutExecutionListener;
import org.eclipse.elk.core.util.BasicProgressMonitor;
import org.eclipse.elk.graph.ElkNode;

/** 打印 jar CGP 后 crossHierarchyMap 段端点 (reverser ready 时). */
public class JarChmProbe {
    public static void main(String[] args) throws Exception {
        LayoutMetaDataService.getInstance().registerLayoutMetaDataProviders();
        String json = new String(Files.readAllBytes(new java.io.File(args[0]).toPath()), StandardCharsets.UTF_8);
        ElkNode root = org.eclipse.elk.graph.json.ElkGraphJson.forGraph(json).toElk();
        root.setProperty(CoreOptions.ALGORITHM, "org.eclipse.elk.layered");
        TestController tc = new TestController("org.eclipse.elk.layered");
        tc.addLayoutExecutionListener(new ILayoutExecutionListener() {
            public void layoutProcessorReady(ILayoutProcessor<?> processor, Object graph, boolean isRoot) {
                if (!(graph instanceof LGraph)) return;
                LGraph g = (LGraph) graph;
                if (g.getParentNode() != null) return;
                String mod = processor.getClass().getSimpleName();
                if (!mod.contains("EdgeAndLayerConstraint")) return;
                Multimap<LEdge, CrossHierarchyEdge> map = g.getProperty(InternalProperties.CROSS_HIERARCHY_MAP);
                if (map == null) { System.out.println("CHM null"); return; }
                System.out.println("CHM size=" + map.size());
                for (LEdge origEdge : map.keySet()) {
                    System.out.println("origEdge " + origEdge);
                    for (CrossHierarchyEdge ch : map.get(origEdge)) {
                        LEdge de = ch.getEdge();
                        LPort s = de.getSource(), t = de.getTarget();
                        String parent = ch.getGraph().getParentNode() != null ? "g#" + ch.getGraph().getParentNode().getDesignation() : "gROOT";
                        System.out.println("  ch " + ch.getType() + " segGraph=" + parent
                            + " src=" + s.getNode().getDesignation() + "[" + s.getNode().getType() + "]"
                            + " tgt=" + t.getNode().getDesignation() + "[" + t.getNode().getType() + "]");
                    }
                }
            }
            public void layoutProcessorFinished(ILayoutProcessor<?> processor, Object graph, boolean isRoot) {}
        });
        BasicProgressMonitor m = new BasicProgressMonitor();
        m.begin("root", 1);
        new RecursiveGraphLayoutEngine().layout(root, tc, m);
        m.done();
    }
}
