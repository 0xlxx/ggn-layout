import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import org.eclipse.elk.core.RecursiveGraphLayoutEngine;
import org.eclipse.elk.core.data.LayoutMetaDataService;
import org.eclipse.elk.core.options.CoreOptions;
import org.eclipse.elk.core.util.BasicProgressMonitor;
import org.eclipse.elk.graph.ElkNode;
import org.eclipse.elk.graph.ElkPort;

public class Instr5Main {
    public static void main(String[] args) throws Exception {
        LayoutMetaDataService.getInstance().registerLayoutMetaDataProviders();
        String json = new String(Files.readAllBytes(new java.io.File(args[0]).toPath()), StandardCharsets.UTF_8);
        ElkNode root = org.eclipse.elk.graph.json.ElkGraphJson.forGraph(json).toElk();
        root.setProperty(CoreOptions.ALGORITHM, "org.eclipse.elk.layered");
        new RecursiveGraphLayoutEngine().layout(root, new BasicProgressMonitor());
        dump(root, "");
    }
    static void dump(ElkNode n, String indent) {
        System.out.println(indent + n.getIdentifier() + " x=" + n.getX() + " y=" + n.getY() + " w=" + n.getWidth() + " h=" + n.getHeight());
        for (ElkPort p : n.getPorts()) {
            System.out.println(indent + "  port " + p.getIdentifier() + " side=" + p.getProperty(CoreOptions.PORT_SIDE) + " x=" + p.getX() + " y=" + p.getY());
        }
        for (ElkNode c : n.getChildren()) dump(c, indent + "  ");
    }
}
