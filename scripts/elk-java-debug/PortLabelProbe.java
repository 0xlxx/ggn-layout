import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import org.eclipse.elk.alg.layered.graph.LGraph;
import org.eclipse.elk.alg.layered.graph.LNode;
import org.eclipse.elk.alg.layered.graph.LPort;
import org.eclipse.elk.alg.layered.graph.LLabel;
import org.eclipse.elk.alg.layered.graph.Layer;
import org.eclipse.elk.core.RecursiveGraphLayoutEngine;
import org.eclipse.elk.core.data.LayoutMetaDataService;
import org.eclipse.elk.core.options.CoreOptions;
import org.eclipse.elk.core.util.BasicProgressMonitor;
import org.eclipse.elk.graph.ElkNode;

/** 布局后打印 LGraph 端口标签位置 (LGraph 直接, 非 JSON 导出). */
public class PortLabelProbe {
    public static void main(String[] args) throws Exception {
        LayoutMetaDataService.getInstance().registerLayoutMetaDataProviders();
        String json = new String(Files.readAllBytes(new java.io.File(args[0]).toPath()), StandardCharsets.UTF_8);
        ElkNode root = org.eclipse.elk.graph.json.ElkGraphJson.forGraph(json).toElk();
        root.setProperty(CoreOptions.ALGORITHM, "org.eclipse.elk.layered");
        BasicProgressMonitor m = new BasicProgressMonitor();
        m.begin("root", 1);
        new RecursiveGraphLayoutEngine().layout(root, m);
        m.done();
        // 布局后 LGraph 已被清理; 直接从 ElkNode 读 (transfer 后)
        dumpElk(root, "");
    }
    static void dumpElk(ElkNode n, String path) {
        String name = n.getLabels().isEmpty() ? n.getIdentifier() : n.getLabels().get(0).getText();
        String p = path + "." + name;
        System.out.printf("%s: pos=(%.1f,%.1f) size=%.0fx%.0f%n", p, n.getX(), n.getY(), n.getWidth(), n.getHeight());
        for (org.eclipse.elk.graph.ElkPort port : n.getPorts()) {
            System.out.printf("  port %s pos=(%.1f,%.1f)%n", port.getIdentifier(), port.getX(), port.getY());
            for (org.eclipse.elk.graph.ElkLabel l : port.getLabels()) {
                System.out.printf("    label %s pos=(%.1f,%.1f) size=(%.1f,%.1f) abs=(%.1f,%.1f)%n", l.getText(), l.getX(), l.getY(), l.getWidth(), l.getHeight(), n.getX()+port.getX()+l.getX(), n.getY()+port.getY()+l.getY());
            }
        }
        for (ElkNode c : n.getChildren()) dumpElk(c, p);
    }
}
