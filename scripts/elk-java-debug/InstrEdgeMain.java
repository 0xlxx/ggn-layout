import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

import org.eclipse.emf.common.util.URI;
import org.eclipse.emf.ecore.resource.Resource;
import org.eclipse.emf.ecore.resource.ResourceSet;
import org.eclipse.emf.ecore.resource.impl.ResourceSetImpl;
import org.eclipse.elk.core.data.LayoutMetaDataService;
import org.eclipse.elk.core.util.persistence.ElkGraphResourceFactory;
import org.eclipse.elk.graph.ElkNode;
import org.eclipse.elk.graph.ElkEdge;
import org.eclipse.elk.graph.ElkGraphPackage;

public class InstrEdgeMain {
    public static void main(String[] args) throws Exception {
        LayoutMetaDataService.getInstance().registerLayoutMetaDataProviders();
        ElkGraphPackage.eINSTANCE.getName();
        String mode = args[0];
        ElkNode root;
        if (mode.equals("elkg")) {
            ResourceSet rs = new ResourceSetImpl();
            rs.getResourceFactoryRegistry().getExtensionToFactoryMap().put("elkg", new ElkGraphResourceFactory());
            URI uri = URI.createFileURI(new File(args[1]).getAbsolutePath());
            Resource res = rs.createResource(uri);
            res.load(null);
            root = (ElkNode) res.getContents().get(0);
        } else {
            String json = new String(Files.readAllBytes(new File(args[1]).toPath()), StandardCharsets.UTF_8);
            root = org.eclipse.elk.graph.json.ElkGraphJson.forGraph(json).toElk();
        }
        dump(root, 0);
    }
    static void dump(ElkNode n, int depth) {
        String ind = "  ".repeat(depth);
        System.out.println(ind + "node " + n.getIdentifier() + " containedEdges=" + n.getContainedEdges().size());
        for (ElkNode c : n.getChildren()) dump(c, depth + 1);
    }
}
