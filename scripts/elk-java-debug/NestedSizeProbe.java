import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import org.eclipse.elk.core.RecursiveGraphLayoutEngine;
import org.eclipse.elk.core.data.LayoutMetaDataService;
import org.eclipse.elk.core.options.CoreOptions;
import org.eclipse.elk.core.util.BasicProgressMonitor;
import org.eclipse.elk.graph.ElkNode;

/** 布局后打印每个 compound 节点的 size + nested children. */
public class NestedSizeProbe {
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
    static void dump(ElkNode n, String path) {
        String name = n.getLabels().isEmpty() ? n.getIdentifier() : n.getLabels().get(0).getText();
        String p = path + "." + name;
        System.out.printf("%s: pos=(%.1f,%.1f) size=%.0fx%.0f%n", p, n.getX(), n.getY(), n.getWidth(), n.getHeight());
        for (org.eclipse.elk.graph.ElkNode c : n.getChildren()) dump(c, p);
    }
}
