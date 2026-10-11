import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.lang.reflect.*;
import java.util.*;
import org.eclipse.elk.core.data.LayoutMetaDataService;
import org.eclipse.elk.core.options.CoreOptions;
import org.eclipse.elk.core.util.BasicProgressMonitor;
import org.eclipse.elk.core.util.IElkProgressMonitor;
import org.eclipse.elk.graph.ElkNode;

public class Instr13Main {
    static Object lg;
    static void dumpNode(String label) throws Exception {
        Method getLayerless = lg.getClass().getMethod("getLayerlessNodes");
        Method getLayers = lg.getClass().getMethod("getLayers");
        List<Object> nodes = new ArrayList<>((List<?>) getLayerless.invoke(lg));
        for (Object l : (List<?>) getLayers.invoke(lg)) nodes.addAll((List<?>) l.getClass().getMethod("getNodes").invoke(l));
        for (Object n : nodes) {
            String des = (String) n.getClass().getMethod("getDesignation").invoke(n);
            if (!des.contains("NN1")) continue;
            Method getPorts = n.getClass().getMethod("getPorts");
            Object holder = n.getClass().getMethod("getProperty", org.eclipse.elk.graph.properties.IProperty.class)
                .invoke(n, Class.forName("org.eclipse.elk.alg.layered.options.InternalProperties").getField("SELF_LOOP_HOLDER").get(null));
            StringBuilder sb = new StringBuilder("### " + label + " nodePorts=[");
            for (Object p : (List<?>) getPorts.invoke(n)) {
                Field idF = p.getClass().getField("id");
                sb.append("#").append(idF.get(p)).append(":").append(p.getClass().getMethod("getSide").invoke(p)).append(" ");
            }
            sb.append("] hidden=").append(holder != null ? holder.getClass().getMethod("arePortsHidden").invoke(holder) : "?");
            System.out.println(sb);
            return;
        }
    }
    static void dumpHolder(String label) throws Exception {
        Method getLayerless = lg.getClass().getMethod("getLayerlessNodes");
        Method getLayers = lg.getClass().getMethod("getLayers");
        List<Object> nodes = new ArrayList<>((List<?>) getLayerless.invoke(lg));
        for (Object l : (List<?>) getLayers.invoke(lg)) nodes.addAll((List<?>) l.getClass().getMethod("getNodes").invoke(l));
        for (Object n : nodes) {
            String des = (String) n.getClass().getMethod("getDesignation").invoke(n);
            if (!des.contains("NN1")) continue;
            Object holder = n.getClass().getMethod("getProperty", org.eclipse.elk.graph.properties.IProperty.class)
                .invoke(n, Class.forName("org.eclipse.elk.alg.layered.options.InternalProperties").getField("SELF_LOOP_HOLDER").get(null));
            if (holder == null) { System.out.println("### " + label + " no holder"); return; }
            Method getLoops = holder.getClass().getMethod("getSLHyperLoops");
            for (Object slLoop : (List<?>) getLoops.invoke(holder)) {
                StringBuilder sb = new StringBuilder("### " + label + " loop ports=[");
                Method getSLPorts = slLoop.getClass().getMethod("getSLPorts");
                for (Object slp : (List<?>) getSLPorts.invoke(slLoop)) {
                    Object lp = slp.getClass().getMethod("getLPort").invoke(slp);
                    Field idF = lp.getClass().getField("id");
                    Method getSide = lp.getClass().getMethod("getSide");
                    sb.append("#").append(idF.get(lp)).append(":").append(getSide.invoke(lp)).append(" ");
                }
                sb.append("]");
                Method getBySide = slLoop.getClass().getMethod("getSLPortsBySide");
                Object mm = getBySide.invoke(slLoop);
                sb.append(" sides=");
                if (mm != null) {
                    for (Object key : (Set<?>) mm.getClass().getMethod("keySet").invoke(mm)) sb.append(key).append(",");
                }
                // leftmost/rightmost + occupied
                Method lmM = slLoop.getClass().getMethod("getLeftmostPort");
                Method rmM = slLoop.getClass().getMethod("getRightmostPort");
                Method occM = slLoop.getClass().getMethod("getOccupiedPortSides");
                Object lm = lmM.invoke(slLoop), rm = rmM.invoke(slLoop), occ = occM.invoke(slLoop);
                sb.append(" leftmost=").append(lm == null ? "null" : lm.getClass().getMethod("getLPort").invoke(lm).getClass().getField("id").get(lm.getClass().getMethod("getLPort").invoke(lm)))
                  .append(" rightmost=").append(rm == null ? "null" : rm.getClass().getMethod("getLPort").invoke(rm).getClass().getField("id").get(rm.getClass().getMethod("getLPort").invoke(rm)))
                  .append(" occupied=").append(occ == null ? "null" : occ.toString());
                System.out.println(sb);
            }
            return;
        }
    }
    static void runProc(String clsName, String label) throws Exception {
        Class<?> cls = Class.forName(clsName);
        Object p;
        if (clsName.contains("GraphTransformer")) {
            p = cls.getDeclaredConstructor(Class.forName("org.eclipse.elk.alg.layered.intermediate.GraphTransformer$Mode")).newInstance(
                Enum.valueOf((Class) Class.forName("org.eclipse.elk.alg.layered.intermediate.GraphTransformer$Mode"), "TO_INPUT_DIRECTION"));
        } else {
            p = cls.getDeclaredConstructor().newInstance();
        }
        cls.getMethod("process", Class.forName("org.eclipse.elk.alg.layered.graph.LGraph"), IElkProgressMonitor.class)
            .invoke(p, lg, new BasicProgressMonitor());
        System.out.println("### ran " + label);
    }
    public static void main(String[] args) throws Exception {
        LayoutMetaDataService.getInstance().registerLayoutMetaDataProviders();
        String json = new String(Files.readAllBytes(new java.io.File(args[0]).toPath()), StandardCharsets.UTF_8);
        ElkNode root = org.eclipse.elk.graph.json.ElkGraphJson.forGraph(json).toElk();
        root.setProperty(CoreOptions.ALGORITHM, "org.eclipse.elk.layered");
        root.setProperty(CoreOptions.HIERARCHY_HANDLING, org.eclipse.elk.core.options.HierarchyHandling.INCLUDE_CHILDREN);
        for (ElkNode c : root.getChildren()) c.setProperty(CoreOptions.HIERARCHY_HANDLING, org.eclipse.elk.core.options.HierarchyHandling.INCLUDE_CHILDREN);
        Class<?> impCls = Class.forName("org.eclipse.elk.alg.layered.graph.transform.ElkGraphImporter");
        Constructor<?> ctor = impCls.getDeclaredConstructor(); ctor.setAccessible(true);
        Object importer = ctor.newInstance();
        Method importGraph = impCls.getDeclaredMethod("importGraph", ElkNode.class); importGraph.setAccessible(true);
        lg = importGraph.invoke(importer, root);
        runProc("org.eclipse.elk.alg.layered.compound.CompoundGraphPreprocessor", "CGP");
        runProc("org.eclipse.elk.alg.layered.intermediate.GraphTransformer", "GraphTransformer");
        runProc("org.eclipse.elk.alg.layered.intermediate.SelfLoopPreProcessor", "SLPP");
        dumpNode("after-SLPP");
        dumpHolder("after-SLPP");
        runProc("org.eclipse.elk.alg.layered.p1cycles.GreedyCycleBreaker", "GCB");
        runProc("org.eclipse.elk.alg.layered.intermediate.LayerConstraintPreprocessor", "LCPre");
        runProc("org.eclipse.elk.alg.layered.p2layers.NetworkSimplexLayerer", "NSL");
        runProc("org.eclipse.elk.alg.layered.intermediate.LayerConstraintPostprocessor", "LCPost");
        runProc("org.eclipse.elk.alg.layered.intermediate.LongEdgeSplitter", "LES");
        runProc("org.eclipse.elk.alg.layered.intermediate.PortSideProcessor", "PSP");
        runProc("org.eclipse.elk.alg.layered.intermediate.InvertedPortProcessor", "IPP");
        runProc("org.eclipse.elk.alg.layered.intermediate.PortListSorter", "PLS");
        dumpNode("before-SLPR");
        runProc("org.eclipse.elk.alg.layered.intermediate.SelfLoopPortRestorer", "SLPR");
        dumpNode("after-SLPR");
        dumpHolder("after-SLPR");
        runProc("org.eclipse.elk.alg.layered.intermediate.LabelAndNodeSizeProcessor", "LANSP");
        runProc("org.eclipse.elk.alg.layered.intermediate.InnermostNodeMarginCalculator", "INMC");
        runProc("org.eclipse.elk.alg.layered.intermediate.SelfLoopRouter", "SLR");
        dumpHolder("after-SLR");
    }
}
