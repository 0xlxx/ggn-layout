import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.lang.reflect.*;
import org.eclipse.elk.core.data.LayoutMetaDataService;
import org.eclipse.elk.core.options.CoreOptions;
import org.eclipse.elk.core.util.BasicProgressMonitor;
import org.eclipse.elk.graph.ElkNode;

public class InstrMain {
    public static void main(String[] args) throws Exception {
        LayoutMetaDataService.getInstance().registerLayoutMetaDataProviders();
        String json = new String(Files.readAllBytes(new java.io.File(args[0]).toPath()), StandardCharsets.UTF_8);
        ElkNode root = org.eclipse.elk.graph.json.ElkGraphJson.forGraph(json).toElk();
        root.setProperty(CoreOptions.ALGORITHM, "org.eclipse.elk.layered");
        ElkNode nparent = null, nps = null;
        for (ElkNode c : root.getChildren()) {
            if (c.getIdentifier().equals("Nparent")) nparent = c;
            if (c.getIdentifier().equals("NparentWithSize")) nps = c;
        }
        System.out.println("input: Nparent " + nparent.getWidth() + "x" + nparent.getHeight() + " portconstraints=" + nparent.getProperty(CoreOptions.PORT_CONSTRAINTS) + " sizeconstraints=" + nparent.getProperty(CoreOptions.NODE_SIZE_CONSTRAINTS));
        // Simulate layoutRecursively(Nparent): import + doLayout + applyLayout via LayeredLayoutProvider
        Class<?> lpCls = Class.forName("org.eclipse.elk.alg.layered.LayeredLayoutProvider");
        Object lp = lpCls.getDeclaredConstructor().newInstance();
        Method layout = lpCls.getMethod("layout", ElkNode.class, org.eclipse.elk.core.util.IElkProgressMonitor.class);
        layout.invoke(lp, nparent, new BasicProgressMonitor());
        System.out.println("after child layout: Nparent " + nparent.getWidth() + "x" + nparent.getHeight()
            + " x=" + nparent.getX() + " y=" + nparent.getY()
            + " sizeconstraints=" + nparent.getProperty(CoreOptions.NODE_SIZE_CONSTRAINTS)
            + " portconstraints=" + nparent.getProperty(CoreOptions.PORT_CONSTRAINTS));
        for (org.eclipse.elk.graph.ElkPort p : nparent.getPorts()) {
            System.out.println("  port " + p.getIdentifier() + " side=" + p.getProperty(CoreOptions.PORT_SIDE) + " x=" + p.getX() + " y=" + p.getY());
        }
        layout.invoke(lp, nps, new BasicProgressMonitor());
        System.out.println("after child layout: NparentWithSize " + nps.getWidth() + "x" + nps.getHeight()
            + " x=" + nps.getX() + " y=" + nps.getY());
    }
}
