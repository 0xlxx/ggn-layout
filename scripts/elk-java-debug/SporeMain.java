import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import org.eclipse.elk.core.data.LayoutMetaDataService;
import org.eclipse.elk.core.util.BasicProgressMonitor;
import org.eclipse.elk.graph.ElkNode;

/** 跑指定 JSON 根算法 (不强制 layered) — spore 直出验证. */
public class SporeMain {
    public static void main(String[] args) throws Exception {
        LayoutMetaDataService.getInstance().registerLayoutMetaDataProviders();
        for (String file : args) {
            String json = new String(Files.readAllBytes(new java.io.File(file).toPath()), StandardCharsets.UTF_8);
            ElkNode root = org.eclipse.elk.graph.json.ElkGraphJson.forGraph(json).toElk();
            new org.eclipse.elk.core.RecursiveGraphLayoutEngine().layout(root, new BasicProgressMonitor());
            System.out.println("### " + file);
            System.out.println(org.eclipse.elk.graph.json.ElkGraphJson.forGraph(root).toJson());
        }
    }
}
