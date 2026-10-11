import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import org.eclipse.elk.core.RecursiveGraphLayoutEngine;
import org.eclipse.elk.core.data.LayoutMetaDataService;
import org.eclipse.elk.core.options.CoreOptions;
import org.eclipse.elk.core.util.BasicProgressMonitor;
import org.eclipse.elk.graph.ElkEdge;
import org.eclipse.elk.graph.ElkEdgeSection;
import org.eclipse.elk.graph.ElkNode;

public class Instr7Main {
    public static void main(String[] args) throws Exception {
        LayoutMetaDataService.getInstance().registerLayoutMetaDataProviders();
        String json = new String(Files.readAllBytes(new java.io.File(args[0]).toPath()), StandardCharsets.UTF_8);
        ElkNode root = org.eclipse.elk.graph.json.ElkGraphJson.forGraph(json).toElk();
        root.setProperty(CoreOptions.ALGORITHM, "org.eclipse.elk.layered");
        new RecursiveGraphLayoutEngine().layout(root, new BasicProgressMonitor());
        for (ElkEdge e : root.getContainedEdges()) {
            System.out.println("EDGE " + e.getIdentifier() + " src=" + e.getSources().get(0).getIdentifier() + " tgt=" + e.getTargets().get(0).getIdentifier());
            for (ElkEdgeSection s : e.getSections()) {
                System.out.println("  section start=(" + s.getStartX() + "," + s.getStartY() + ") end=(" + s.getEndX() + "," + s.getEndY() + ")");
                s.getBendPoints().forEach(b -> System.out.println("  bend=(" + b.getX() + "," + b.getY() + ")"));
            }
        }
    }
}
