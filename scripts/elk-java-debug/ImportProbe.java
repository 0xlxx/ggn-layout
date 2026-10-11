import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import org.eclipse.elk.core.data.LayoutMetaDataService;
import org.eclipse.elk.graph.ElkNode;
import org.eclipse.elk.graph.ElkPort;
import org.eclipse.elk.graph.ElkLabel;

/** 打印导入后 (未布局) 的端口标签位置/尺寸. */
public class ImportProbe {
    public static void main(String[] args) throws Exception {
        LayoutMetaDataService.getInstance().registerLayoutMetaDataProviders();
        String json = new String(Files.readAllBytes(new java.io.File(args[0]).toPath()), StandardCharsets.UTF_8);
        ElkNode root = org.eclipse.elk.graph.json.ElkGraphJson.forGraph(json).toElk();
        dump(root, "");
    }
    static void dump(ElkNode n, String path) {
        String name = n.getLabels().isEmpty() ? n.getIdentifier() : n.getLabels().get(0).getText();
        String p = path + "." + name;
        for (ElkPort port : n.getPorts()) {
            for (ElkLabel l : port.getLabels()) {
                System.out.printf("label %s port=%s pos=(%.1f,%.1f) size=(%.1f,%.1f)%n", l.getText(), port.getIdentifier(), l.getX(), l.getY(), l.getWidth(), l.getHeight());
            }
        }
        for (ElkNode c : n.getChildren()) dump(c, p);
    }
}
