import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import org.eclipse.elk.core.RecursiveGraphLayoutEngine;
import org.eclipse.elk.core.data.LayoutMetaDataService;
import org.eclipse.elk.core.options.CoreOptions;
import org.eclipse.elk.core.util.BasicProgressMonitor;
import org.eclipse.elk.graph.ElkNode;
import org.eclipse.elk.graph.ElkEdge;
import org.eclipse.elk.graph.ElkEdgeSection;
import org.eclipse.elk.graph.ElkBendPoint;
import org.eclipse.elk.graph.ElkLabel;
import org.eclipse.elk.graph.properties.Property;

public class InstrLabMain {
    public static void main(String[] args) throws Exception {
        LayoutMetaDataService.getInstance().registerLayoutMetaDataProviders();
        String json = new String(Files.readAllBytes(new java.io.File(args[0]).toPath()), StandardCharsets.UTF_8);
        ElkNode root = org.eclipse.elk.graph.json.ElkGraphJson.forGraph(json).toElk();
        root.setProperty(CoreOptions.ALGORITHM, "org.eclipse.elk.layered");
        BasicProgressMonitor m = new BasicProgressMonitor();
        m.begin("root", 1);
        new RecursiveGraphLayoutEngine().layout(root, m);
        m.done();
        dumpNode(root);
    }
    static void dumpNode(ElkNode n) {
        System.out.println("node " + n.getIdentifier() + " x=" + n.getX() + " y=" + n.getY() + " w=" + n.getWidth() + " h=" + n.getHeight());
        for (ElkLabel l : n.getLabels()) {
            System.out.println("  nodelabel " + l.getText() + " pos=(" + l.getX() + "," + l.getY() + ") size=(" + l.getWidth() + "," + l.getHeight() + ") abs=(" + (l.getX() + n.getX()) + "," + (l.getY() + n.getY()) + ")");
        }
        for (ElkEdge e : n.getContainedEdges()) {
            System.out.println("  edge " + e.getIdentifier() + " src=" + e.getSources() + " tgt=" + e.getTargets());
            for (ElkLabel l : e.getLabels()) {
                System.out.println("    edgelabel " + l.getText() + " pos=(" + l.getX() + "," + l.getY() + ") size=(" + l.getWidth() + "," + l.getHeight() + ")");
            }
            for (ElkEdgeSection s : e.getSections()) {
                StringBuilder sb = new StringBuilder("    section start=(" + s.getStartX() + "," + s.getStartY() + ")");
                for (ElkBendPoint b : s.getBendPoints()) sb.append(" bend=(" + b.getX() + "," + b.getY() + ")");
                sb.append(" end=(" + s.getEndX() + "," + s.getEndY() + ")");
                System.out.println(sb);
            }
        }
        for (ElkNode c : n.getChildren()) dumpNode(c);
    }
}
