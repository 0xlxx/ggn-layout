import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import org.eclipse.elk.core.RecursiveGraphLayoutEngine;
import org.eclipse.elk.core.data.LayoutMetaDataService;
import org.eclipse.elk.core.options.CoreOptions;
import org.eclipse.elk.core.options.PortSide;
import org.eclipse.elk.core.util.BasicProgressMonitor;
import org.eclipse.elk.graph.ElkNode;
import org.eclipse.elk.graph.ElkPort;

/** 跑完整布局后, 输出每个节点 + 端口最终位置 (节点路径由标签链拼出). */
public class PortProbe {
    public static void main(String[] args) throws Exception {
        LayoutMetaDataService.getInstance().registerLayoutMetaDataProviders();
        String json = new String(Files.readAllBytes(new java.io.File(args[0]).toPath()), StandardCharsets.UTF_8);
        ElkNode root = org.eclipse.elk.graph.json.ElkGraphJson.forGraph(json).toElk();
        root.setProperty(CoreOptions.ALGORITHM, "org.eclipse.elk.layered");
        BasicProgressMonitor m = new BasicProgressMonitor();
        m.begin("root", 1);
        new RecursiveGraphLayoutEngine().layout(root, m);
        m.done();
        dump(root, "");
    }
    static String label(ElkNode n) {
        return n.getLabels().isEmpty() ? n.getIdentifier() : n.getLabels().get(0).getText();
    }
    static void dump(ElkNode node, String path) {
        String p = path.isEmpty() ? label(node) : path + "." + label(node);
        StringBuilder sb = new StringBuilder();
        for (ElkPort port : node.getPorts()) {
            sb.append(String.format(" %s@%.1f,%.1f(%.0fx%.0f)", port.getProperty(CoreOptions.PORT_SIDE).toString(),
                    port.getX(), port.getY(), port.getWidth(), port.getHeight()));
        }
        System.out.printf("%s: pos=(%.1f,%.1f) size=%.0fx%.0f ports=[%s]%n",
                p, node.getX(), node.getY(), node.getWidth(), node.getHeight(), sb.toString());
        for (ElkNode child : node.getChildren()) dump(child, p);
    }
}
