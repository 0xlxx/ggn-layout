import java.io.File;
import java.util.Deque;
import java.util.LinkedList;

import org.eclipse.emf.common.util.URI;
import org.eclipse.emf.ecore.resource.Resource;
import org.eclipse.emf.ecore.resource.ResourceSet;
import org.eclipse.emf.ecore.resource.impl.ResourceSetImpl;
import org.eclipse.elk.core.RecursiveGraphLayoutEngine;
import org.eclipse.elk.core.data.LayoutMetaDataService;
import org.eclipse.elk.core.options.CoreOptions;
import org.eclipse.elk.core.options.PortConstraints;
import org.eclipse.elk.core.util.BasicProgressMonitor;
import org.eclipse.elk.core.util.persistence.ElkGraphResourceFactory;
import org.eclipse.elk.graph.ElkNode;
import org.eclipse.elk.graph.ElkPort;
import org.eclipse.elk.alg.layered.options.LayeredOptions;
import org.eclipse.elk.graph.ElkGraphPackage;

public class InstrElkgMain {
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

        // configurePorts (Java PortListSorterTest 语义)
        Deque<ElkNode> nodeQueue = new LinkedList<>(root.getChildren());
        while (!nodeQueue.isEmpty()) {
            ElkNode node = nodeQueue.poll();
            nodeQueue.addAll(node.getChildren());
            if (node.getProperty(LayeredOptions.PORT_CONSTRAINTS) != PortConstraints.FIXED_ORDER) {
                node.setProperty(LayeredOptions.PORT_CONSTRAINTS, PortConstraints.FIXED_ORDER);
                int index = 0;
                for (ElkPort port : node.getPorts()) {
                    port.setProperty(LayeredOptions.PORT_INDEX, index++);
                }
            }
        }

        new RecursiveGraphLayoutEngine().layout(root, new BasicProgressMonitor());
        dumpNode(root, 0, 0);
    }
    static void dumpNode(ElkNode n, double px, double py) {
        double ax = px + n.getX(), ay = py + n.getY();
        System.out.println("node " + n.getIdentifier() + " x=" + n.getX() + " y=" + n.getY() + " w=" + n.getWidth() + " h=" + n.getHeight());
        for (ElkPort p : n.getPorts()) {
            Integer idx = p.getProperty(LayeredOptions.PORT_INDEX);
            System.out.println("  port " + p.getIdentifier() + " pos=(" + p.getX() + "," + p.getY() + ") abs=(" + (p.getX()+ax) + "," + (p.getY()+ay) + ") idx=" + idx);
        }
        for (ElkNode c : n.getChildren()) dumpNode(c, ax, ay);
    }
}
