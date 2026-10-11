import java.io.File;
import org.eclipse.emf.common.util.URI;
import org.eclipse.emf.ecore.resource.Resource;
import org.eclipse.emf.ecore.resource.ResourceSet;
import org.eclipse.emf.ecore.resource.impl.ResourceSetImpl;
import org.eclipse.elk.core.RecursiveGraphLayoutEngine;
import org.eclipse.elk.core.data.LayoutMetaDataService;
import org.eclipse.elk.core.options.CoreOptions;
import org.eclipse.elk.core.options.Direction;
import org.eclipse.elk.core.options.HierarchyHandling;
import org.eclipse.elk.core.options.PortConstraints;
import org.eclipse.elk.core.util.BasicProgressMonitor;
import org.eclipse.elk.core.util.persistence.ElkGraphResourceFactory;
import org.eclipse.elk.graph.ElkNode;
import org.eclipse.elk.graph.ElkPort;
import org.eclipse.elk.graph.ElkGraphPackage;
import org.eclipse.elk.alg.layered.options.LayeredOptions;
import java.util.Deque;
import java.util.LinkedList;

public class InstrOptTestMain {
    public static void main(String[] args) throws Exception {
        LayoutMetaDataService.getInstance().registerLayoutMetaDataProviders();
        ElkGraphPackage.eINSTANCE.getName();
        ResourceSet rs = new ResourceSetImpl();
        rs.getResourceFactoryRegistry().getExtensionToFactoryMap().put("elkg", new ElkGraphResourceFactory());
        URI uri = URI.createFileURI(new File(args[0]).getAbsolutePath());
        Resource res = rs.createResource(uri);
        res.load(null);
        ElkNode root = (ElkNode) res.getContents().get(0);
        root.setProperty(CoreOptions.ALGORITHM, "org.eclipse.elk.layered");
        // 选项: 模拟 elktToElkJson 注入
        for (String opt : args[1].split(",")) {
            if (opt.equals("direction")) root.setProperty(CoreOptions.DIRECTION, Direction.RIGHT);
            if (opt.equals("seed")) root.setProperty(CoreOptions.RANDOM_SEED, 1);
            if (opt.equals("hier")) root.setProperty(CoreOptions.HIERARCHY_HANDLING, HierarchyHandling.INCLUDE_CHILDREN);
        }
        Deque<ElkNode> nodeQueue = new LinkedList<>(root.getChildren());
        while (!nodeQueue.isEmpty()) {
            ElkNode node = nodeQueue.poll();
            nodeQueue.addAll(node.getChildren());
            if (node.getProperty(LayeredOptions.PORT_CONSTRAINTS) != PortConstraints.FIXED_ORDER) {
                node.setProperty(LayeredOptions.PORT_CONSTRAINTS, PortConstraints.FIXED_ORDER);
                int index = 0;
                for (ElkPort port : node.getPorts()) port.setProperty(LayeredOptions.PORT_INDEX, index++);
            }
        }
        new RecursiveGraphLayoutEngine().layout(root, new BasicProgressMonitor());
        dumpNode(root, 0, 0);
    }
    static void dumpNode(ElkNode n, double px, double py) {
        double ax = px + n.getX(), ay = py + n.getY();
        if (n.getIdentifier().equals("N19")) {
            System.out.println("node N19 w=" + n.getWidth() + " h=" + n.getHeight());
            for (ElkPort p : n.getPorts()) {
                System.out.println("  port " + p.getIdentifier() + " pos=(" + p.getX() + "," + p.getY() + ")");
            }
        }
        for (ElkNode c : n.getChildren()) dumpNode(c, ax, ay);
    }
}
