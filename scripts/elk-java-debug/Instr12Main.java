import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.lang.reflect.*;
import java.util.*;
import org.eclipse.elk.core.data.LayoutMetaDataService;
import org.eclipse.elk.core.options.CoreOptions;
import org.eclipse.elk.core.util.BasicProgressMonitor;
import org.eclipse.elk.core.util.IElkProgressMonitor;
import org.eclipse.elk.graph.ElkNode;

public class Instr12Main {
    static void dumpN1(Object lg, String label) throws Exception {
        List<Object> nodes = new ArrayList<>();
        Method getLayerless = lg.getClass().getMethod("getLayerlessNodes");
        Method getLayers = lg.getClass().getMethod("getLayers");
        nodes.addAll((List<?>) getLayerless.invoke(lg));
        for (Object l : (List<?>) getLayers.invoke(lg)) nodes.addAll((List<?>) l.getClass().getMethod("getNodes").invoke(l));
        for (Object n : nodes) {
            String des = (String) n.getClass().getMethod("getDesignation").invoke(n);
            if (!des.contains("NN1")) continue;
            StringBuilder sb = new StringBuilder("### " + label + " " + des + " ports=[");
            for (Object p : (List<?>) n.getClass().getMethod("getPorts").invoke(n)) {
                Field idF = p.getClass().getField("id");
                Method getSide = p.getClass().getMethod("getSide");
                Method getNet = p.getClass().getMethod("getNetFlow");
                sb.append("#").append(idF.get(p)).append(":").append(getSide.invoke(p)).append(":nf").append(getNet.invoke(p));
                for (Object e : (List<?>) p.getClass().getMethod("getOutgoingEdges").invoke(p)) {
                    Object tp = e.getClass().getMethod("getTarget").invoke(e);
                    sb.append("->#").append(tp.getClass().getField("id").get(tp));
                }
                for (Object e : (List<?>) p.getClass().getMethod("getIncomingEdges").invoke(p)) {
                    Object sp = e.getClass().getMethod("getSource").invoke(e);
                    sb.append("<-").append("#").append(sp.getClass().getField("id").get(sp));
                }
                sb.append(" ");
            }
            sb.append("]");
            System.out.println(sb);
            return;
        }
    }
    public static void main(String[] args) throws Exception {
        LayoutMetaDataService.getInstance().registerLayoutMetaDataProviders();
        String json = new String(Files.readAllBytes(new java.io.File(args[0]).toPath()), StandardCharsets.UTF_8);
        ElkNode root = org.eclipse.elk.graph.json.ElkGraphJson.forGraph(json).toElk();
        root.setProperty(CoreOptions.ALGORITHM, "org.eclipse.elk.layered");
        root.setProperty(CoreOptions.HIERARCHY_HANDLING, org.eclipse.elk.core.options.HierarchyHandling.INCLUDE_CHILDREN);
        for (ElkNode c : root.getChildren()) c.setProperty(CoreOptions.HIERARCHY_HANDLING, org.eclipse.elk.core.options.HierarchyHandling.INCLUDE_CHILDREN);
        // import
        Class<?> impCls = Class.forName("org.eclipse.elk.alg.layered.graph.transform.ElkGraphImporter");
        Constructor<?> ctor = impCls.getDeclaredConstructor(); ctor.setAccessible(true);
        Object importer = ctor.newInstance();
        Method importGraph = impCls.getDeclaredMethod("importGraph", ElkNode.class); importGraph.setAccessible(true);
        Object lg = importGraph.invoke(importer, root);
        dumpN1(lg, "after-import");
        // CompoundGraphPreprocessor (INCLUDE_CHILDREN)
        Class<?> cgpCls = Class.forName("org.eclipse.elk.alg.layered.compound.CompoundGraphPreprocessor");
        Object cgp = cgpCls.getDeclaredConstructor().newInstance();
        Method process = cgpCls.getMethod("process", Class.forName("org.eclipse.elk.alg.layered.graph.LGraph"), IElkProgressMonitor.class);
        process.invoke(cgp, lg, new BasicProgressMonitor());
        dumpN1(lg, "after-CGP");
        // GraphTransformer in
        Class<?> gtCls = Class.forName("org.eclipse.elk.alg.layered.intermediate.GraphTransformer");
        Object gt = gtCls.getDeclaredConstructor(Class.forName("org.eclipse.elk.alg.layered.intermediate.GraphTransformer$Mode")).newInstance(
            Enum.valueOf((Class) Class.forName("org.eclipse.elk.alg.layered.intermediate.GraphTransformer$Mode"), "TO_INPUT_DIRECTION"));
        gtCls.getMethod("process", Class.forName("org.eclipse.elk.alg.layered.graph.LGraph"), IElkProgressMonitor.class).invoke(gt, lg, new BasicProgressMonitor());
        dumpN1(lg, "after-GraphTransformer");
        // EdgeAndLayerConstraintEdgeReverser
        Class<?> revCls = Class.forName("org.eclipse.elk.alg.layered.intermediate.EdgeAndLayerConstraintEdgeReverser");
        Object rev = revCls.getDeclaredConstructor().newInstance();
        revCls.getMethod("process", Class.forName("org.eclipse.elk.alg.layered.graph.LGraph"), IElkProgressMonitor.class).invoke(rev, lg, new BasicProgressMonitor());
        dumpN1(lg, "after-Reverser");
        // SelfLoopPreProcessor
        Class<?> slppCls = Class.forName("org.eclipse.elk.alg.layered.intermediate.SelfLoopPreProcessor");
        Object slpp = slppCls.getDeclaredConstructor().newInstance();
        slppCls.getMethod("process", Class.forName("org.eclipse.elk.alg.layered.graph.LGraph"), IElkProgressMonitor.class).invoke(slpp, lg, new BasicProgressMonitor());
        dumpN1(lg, "after-SLPP");
    }
}
