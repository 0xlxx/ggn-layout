import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.lang.reflect.*;
import org.eclipse.elk.core.data.LayoutMetaDataService;
import org.eclipse.elk.core.options.CoreOptions;
import org.eclipse.elk.core.util.BasicProgressMonitor;
import org.eclipse.elk.graph.ElkNode;

public class Instr3Main {
    static Object vx(Object v) throws Exception { return v.getClass().getField("x").get(v); }
    static Object vy(Object v) throws Exception { return v.getClass().getField("y").get(v); }
    public static void main(String[] args) throws Exception {
        LayoutMetaDataService.getInstance().registerLayoutMetaDataProviders();
        String json = new String(Files.readAllBytes(new java.io.File(args[0]).toPath()), StandardCharsets.UTF_8);
        ElkNode root = org.eclipse.elk.graph.json.ElkGraphJson.forGraph(json).toElk();
        root.setProperty(CoreOptions.ALGORITHM, "org.eclipse.elk.layered");
        ElkNode nparent = root.getChildren().get(0);
        Class<?> impCls = Class.forName("org.eclipse.elk.alg.layered.graph.transform.ElkGraphImporter");
        Constructor<?> ctor = impCls.getDeclaredConstructor(); ctor.setAccessible(true);
        Object importer = ctor.newInstance();
        Method importGraph = impCls.getDeclaredMethod("importGraph", ElkNode.class); importGraph.setAccessible(true);
        Object lg = importGraph.invoke(importer, nparent);
        Class<?> elkCls = Class.forName("org.eclipse.elk.alg.layered.ElkLayered");
        Object elk = elkCls.getDeclaredConstructor().newInstance();
        Method layout = elkCls.getMethod("doLayout", Class.forName("org.eclipse.elk.alg.layered.graph.LGraph"), org.eclipse.elk.core.util.IElkProgressMonitor.class);
        layout.invoke(elk, lg, new BasicProgressMonitor());
        Method getSize = lg.getClass().getMethod("getSize");
        Method getOffset = lg.getClass().getMethod("getOffset");
        Object size = getSize.invoke(lg), off = getOffset.invoke(lg);
        System.out.println("graph size=(" + vx(size) + "," + vy(size) + ") offset=(" + vx(off) + "," + vy(off) + ")");
        Method getLayers = lg.getClass().getMethod("getLayers");
        for (Object l : (java.util.List<?>) getLayers.invoke(lg)) {
            Object lsize = l.getClass().getMethod("getSize").invoke(l);
            Object loff = l.getClass().getMethod("getOffset").invoke(l);
            System.out.println("  LAYER size=(" + vx(lsize) + "," + vy(lsize) + ") offset=(" + vx(loff) + "," + vy(loff) + ")");
            for (Object n : (java.util.List<?>) l.getClass().getMethod("getNodes").invoke(l)) {
                Object pos = n.getClass().getMethod("getPosition").invoke(n);
                Object nsize = n.getClass().getMethod("getSize").invoke(n);
                System.out.println("    NODE " + n.getClass().getMethod("getDesignation").invoke(n) + " pos=(" + vx(pos) + "," + vy(pos) + ") size=(" + vx(nsize) + "," + vy(nsize) + ")");
            }
        }
    }
}
