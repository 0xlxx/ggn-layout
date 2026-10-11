import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import org.eclipse.elk.core.RecursiveGraphLayoutEngine;
import org.eclipse.elk.core.data.LayoutMetaDataService;
import org.eclipse.elk.core.options.CoreOptions;
import org.eclipse.elk.core.util.BasicProgressMonitor;
import org.eclipse.elk.graph.ElkNode;
import org.eclipse.elk.graph.ElkEdge;
import org.eclipse.elk.graph.ElkLabel;
import org.eclipse.elk.graph.ElkPort;
import org.eclipse.elk.graph.util.ElkGraphUtil;

public class InstrLab2Main {
    public static void main(String[] args) throws Exception {
        LayoutMetaDataService.getInstance().registerLayoutMetaDataProviders();
        String json = new String(Files.readAllBytes(new java.io.File(args[0]).toPath()), StandardCharsets.UTF_8);
        ElkNode root = org.eclipse.elk.graph.json.ElkGraphJson.forGraph(json).toElk();
        root.setProperty(CoreOptions.ALGORITHM, "org.eclipse.elk.layered");
        BasicProgressMonitor m = new BasicProgressMonitor();
        m.begin("root", 1);
        new RecursiveGraphLayoutEngine().layout(root, m);
        m.done();
        dumpNode(root, 0, 0);
    }
    static void dumpNode(ElkNode n, double px, double py) {
        double ax = px + n.getX(), ay = py + n.getY();
        System.out.println("node " + n.getIdentifier() + " x=" + n.getX() + " y=" + n.getY() + " abs=(" + ax + "," + ay + ") w=" + n.getWidth() + " h=" + n.getHeight() + " padding=" + n.getProperty(org.eclipse.elk.core.options.CoreOptions.PADDING));
        for (ElkLabel l : n.getLabels()) {
            System.out.println("  nodelabel " + l.getText() + " pos=(" + l.getX() + "," + l.getY() + ") abs=(" + (l.getX()+ax) + "," + (l.getY()+ay) + ")");
        }
        for (ElkEdge e : n.getContainedEdges()) {
            System.out.println("  edge " + e.getIdentifier());
            for (ElkLabel l : e.getLabels()) {
                System.out.println("    edgelabel " + l.getText() + " pos=(" + l.getX() + "," + l.getY() + ") abs=(" + (l.getX()+ax) + "," + (l.getY()+ay) + ")");
            }
        }
        for (ElkPort p : n.getPorts()) {
            System.out.println("  port " + p.getIdentifier() + " pos=(" + p.getX() + "," + p.getY() + ") abs=(" + (p.getX()+ax) + "," + (p.getY()+ay) + ")");
        }
        for (ElkNode c : n.getChildren()) dumpNode(c, ax, ay);
    }
}
