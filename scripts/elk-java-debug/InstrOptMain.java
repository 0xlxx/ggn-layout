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
import org.eclipse.elk.graph.ElkGraphPackage;

public class InstrOptMain {
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
        System.out.println("id=" + root.getIdentifier());
        for (Object k : root.getProperties().keySet()) {
            System.out.println("  " + k + " = " + root.getProperty((org.eclipse.elk.graph.properties.IProperty) k));
        }
        // 显式查询几个关键选项
        System.out.println("direction=" + root.getProperty(org.eclipse.elk.core.options.CoreOptions.DIRECTION));
        System.out.println("randomSeed=" + root.getProperty(org.eclipse.elk.core.options.CoreOptions.RANDOM_SEED));
        System.out.println("hierarchyHandling=" + root.getProperty(org.eclipse.elk.core.options.CoreOptions.HIERARCHY_HANDLING));
        System.out.println("portConstraints=" + root.getProperty(org.eclipse.elk.core.options.CoreOptions.PORT_CONSTRAINTS));
    }
}
