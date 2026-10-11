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

public class InstrCmpMain {
    public static void main(String[] args) throws Exception {
        LayoutMetaDataService.getInstance().registerLayoutMetaDataProviders();
        String json = new String(Files.readAllBytes(new java.io.File(args[0]).toPath()), StandardCharsets.UTF_8);
        ElkNode root = org.eclipse.elk.graph.json.ElkGraphJson.forGraph(json).toElk();
        root.setProperty(CoreOptions.ALGORITHM, "org.eclipse.elk.layered");
        BasicProgressMonitor m = new BasicProgressMonitor();
        m.begin("root", 1);
        new RecursiveGraphLayoutEngine().layout(root, m);
        m.done();
        dump(root);
    }
    static void dump(ElkNode n) {
        System.out.println("node " + n.getIdentifier() + " x=" + n.getX() + " y=" + n.getY() + " w=" + n.getWidth() + " h=" + n.getHeight());
        for (ElkEdge e : n.getContainedEdges()) {
            System.out.println("  edge " + e.getIdentifier() + " src=" + e.getSources() + " tgt=" + e.getTargets());
            for (ElkEdgeSection s : e.getSections()) {
                StringBuilder sb = new StringBuilder("    section start=(" + s.getStartX() + "," + s.getStartY() + ")");
                for (ElkBendPoint b : s.getBendPoints()) sb.append(" bend=(" + b.getX() + "," + b.getY() + ")");
                sb.append(" end=(" + s.getEndX() + "," + s.getEndY() + ")");
                System.out.println(sb);
            }
        }
        for (ElkNode c : n.getChildren()) dump(c);
    }
}
