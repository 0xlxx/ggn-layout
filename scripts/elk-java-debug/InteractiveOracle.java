import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import org.eclipse.elk.alg.layered.graph.LEdge;
import org.eclipse.elk.alg.layered.graph.LGraph;
import org.eclipse.elk.alg.layered.graph.LNode;
import org.eclipse.elk.alg.layered.graph.LPort;
import org.eclipse.elk.alg.layered.p2layers.InteractiveLayerer;
import org.eclipse.elk.core.util.BasicProgressMonitor;
import org.eclipse.elk.graph.ElkEdge;
import org.eclipse.elk.graph.ElkNode;
import org.eclipse.elk.graph.ElkPort;
import org.eclipse.elk.graph.json.ElkGraphJson;

/**
 * InteractiveLayerer 直接调用 oracle:
 * 输入 elk.json (节点 position/size, 边), 直接跑 InteractiveLayerer.process,
 * 输出每个节点最终层号 (identifier:listIndex).
 */
public class InteractiveOracle {
    public static void main(String[] args) throws Exception {
        String json = new String(java.nio.file.Files.readAllBytes(new java.io.File(args[0]).toPath()), "UTF-8");
        ElkNode elk = ElkGraphJson.forGraph(json).toElk();

        LGraph g = new LGraph();
        Map<String, LNode> byId = new LinkedHashMap<>();
        for (ElkNode en : elk.getChildren()) {
            LNode n = new LNode(g);
            n.getPosition().x = en.getX();
            n.getPosition().y = en.getY();
            n.getSize().x = en.getWidth();
            n.getSize().y = en.getHeight();
            g.getLayerlessNodes().add(n);
            byId.put(en.getIdentifier(), n);
        }
        for (ElkEdge ee : elk.getContainedEdges()) {
            Optional<ElkNode> src = ee.getSources().stream().findFirst()
                    .map(s -> ((ElkPort) s).getParent());
            Optional<ElkNode> tgt = ee.getTargets().stream().findFirst()
                    .map(t -> ((ElkPort) t).getParent());
            if (src.isPresent() && tgt.isPresent()) {
                LPort sp = new LPort();
                sp.setNode(byId.get(src.get().getIdentifier()));
                LPort tp = new LPort();
                tp.setNode(byId.get(tgt.get().getIdentifier()));
                LEdge e = new LEdge();
                e.setSource(sp);
                e.setTarget(tp);
            }
        }

        new InteractiveLayerer().process(g, new BasicProgressMonitor());

        for (Map.Entry<String, LNode> e : byId.entrySet()) {
            LNode n = e.getValue();
            int idx = g.getLayers().indexOf(n.getLayer());
            System.out.println(e.getKey() + ":" + idx);
        }
    }
}
